# ADR-004: JWT Token Strategy & Session Management

## Status

**Accepted** (November 2026)

## Context

After a user verifies their OTP, they need to be authenticated for future requests. We have two distinct clients: a Web app (React) and a Mobile app (React Native).

We need a solution that:

1. Allows stateless authentication for fast API responses.
2. Supports "Logout from all devices" (requires stateful tracking).
3. Prevents brute-force attacks if a database is compromised.
4. Handles the different storage capabilities of Web (cookies) vs. Mobile (secure storage).

## Decision

We implemented a **Dual-Token Strategy** backed by a stateful **Session** collection in MongoDB.

1. **Short-lived Access Tokens (JWT)**:
   - Lifespan: 15 minutes.
   - Sent in the `Authorization: Bearer` header.
   - Not stored in the database. If stolen, they expire quickly.
2. **Long-lived Refresh Tokens (JWT)**:
   - Lifespan: 30 days.
   - Used only to generate new Access Tokens.
   - **Hashed using SHA-256** and stored in the `Session` document.
3. **Hashing Algorithms**:
   - **Refresh Tokens:** Use SHA-256 (fast). Because they are long, cryptographically random strings (high entropy), they cannot be brute-forced. Fast hashing allows for quick database lookups.
   - **OTPs:** Use Bcrypt (slow). OTPs are only 6 digits (low entropy). Bcrypt's slowness prevents offline brute-force attacks if the DB is leaked.
4. **Client Delivery**:
   - **Web:** The Refresh Token is sent as a secure, `HttpOnly` cookie. This prevents XSS (Cross-Site Scripting) attacks from stealing it.
   - **Mobile:** The Refresh Token is sent in the JSON body, to be stored in the device's native secure storage (e.g., Expo SecureStore).
5. **Session Revocation**:
   - Every login creates a new `Session` document with the user's IP and User-Agent.
   - To "Logout from all devices," we simply mark all Session documents for that user as `isRevoked: true`.
6. **Refresh Token Rotation**:
   - Every call to `POST /refresh` issues a **new** refresh token and invalidates the old one (the `Session.refreshTokenHash` is updated).
   - **Reuse detection:** if a client presents a refresh token whose hash no longer matches the stored hash, this means an _old_ token is being replayed. We revoke the entire session — either the token leaked, or a client cached a previous one. The legitimate user will simply log in again.

## Consequences

### Positive

- **Security:** Bcrypt for OTPs prevents brute-forcing. HttpOnly cookies protect the Web client from XSS.
- **Scalability:** Access tokens are verified via their cryptographic signature (no DB lookup needed on most requests, unless checking for session revocation).
- **User Experience:** Users can stay logged in for 30 days without re-entering their password, while still having the ability to revoke compromised devices.
- **Theft detection:** Refresh token rotation means a stolen token is only useful once. If both attacker and legitimate client try to use it, the reuse detection fires and the session is killed.

### Negative

- **Complexity:** Requires managing two different tokens, a Session collection, and different delivery mechanisms for Web vs. Mobile.
- **Database Overhead:** If we check the `Session` collection on every API request to ensure the token hasn't been revoked, it adds a database read. _(Note: We mitigate this by keeping Access Tokens short-lived, meaning we only check the Session collection when the token is refreshed)._
- **Concurrent refresh race:** Two clients (or two tabs) can fire `/refresh` at the same instant with the same token. Rotation is not atomic across requests — the first rotate overwrites the second's hash, orphaning one token. The orphaned client's next refresh triggers reuse detection, revoking both sessions. Clients should serialize refreshes (single in-flight promise) to avoid spurious logouts. Server-side atomic rotation via `findOneAndUpdate` narrows the window but doesn't eliminate the revoke-on-race failure mode.
- **Logout on concurrent clients:** Because the session record is shared across all tabs of a web client (one refresh token per session), a bug in one tab's refresh handling can cascade — reuse detection revokes the session, logging out every tab. This is by design (better to log out than to leave a stolen token valid), but it means client-side refresh bugs become more visible.

## Alternatives Considered

- **Stateless JWT with no session collection:** Rejected. Loses the ability to revoke sessions, force logout, or detect token theft. The stateful session is the trade-off we accept for security.
- **Single long-lived token (no refresh):** Rejected. If stolen, the attacker has access for the full token lifespan — no window to revoke. Rotation + short access tokens + revocation via session is the standard pattern for a reason.
- **No rotation (reuse the same refresh token for its full lifespan):** Rejected. A stolen refresh token is valid until expiry (30 days) with no detection mechanism. Rotation with reuse detection reduces the exposure window and, critically, catches theft.
- **Opaque (non-JWT) refresh tokens:** Considered. Would require a DB lookup for every refresh (which we do anyway, to check `isRevoked`), so opaque tokens don't save anything over JWTs here. JWTs have the advantage of carrying the `sid` claim, so we can fetch the session by `_id` directly instead of by token-hash index.
