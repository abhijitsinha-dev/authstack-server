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

## Consequences

### Positive

- **Security:** Bcrypt for OTPs prevents brute-forcing. HttpOnly cookies protect the Web client from XSS.
- **Scalability:** Access tokens are verified via their cryptographic signature (no DB lookup needed on most requests, unless checking for session revocation).
- **User Experience:** Users can stay logged in for 30 days without re-entering their password, while still having the ability to revoke compromised devices.

### Negative

- **Complexity:** Requires managing two different tokens, a Session collection, and different delivery mechanisms for Web vs. Mobile.
- **Database Overhead:** If we check the `Session` collection on every API request to ensure the token hasn't been revoked, it adds a database read. _(Note: We mitigate this by keeping Access Tokens short-lived, meaning we only check the Session collection when the token is refreshed)._
