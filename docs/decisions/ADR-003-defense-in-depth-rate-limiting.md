# ADR-003: Defense-in-Depth Rate Limiting

## Status

**Accepted** (November 2026)

## Context

We need to protect our authentication endpoints from abuse. Without rate limiting, an attacker could:

1. DDoS our API, causing our MongoDB database to crash under the load of thousands of queries.
2. Spam a specific user's email address, burning through our Brevo email quota and harassing the user.
3. Enumerate which email addresses have verified accounts by observing response differences.

The third concern — enumeration — is specific to `forgot-password` and shapes that endpoint's design more than the other two. It's the reason the 20-second cooldown ends up being a **deliberate leak** rather than an oversight (see "Known Trade-off" below).

## Decision

We implement multiple independent layers of defense:

1. **IP-based Rate Limiting (Upstash):** At the route middleware level, we use `@upstash/ratelimit` to restrict requests per IP. Limits differ by endpoint based on abuse potential:

   | Endpoint             | Production limit |
   | :------------------- | :--------------- |
   | `signup/request-otp` | 5 / min          |
   | `signup/resend-otp`  | 1 / 20 sec       |
   | `signup/verify-otp`  | 10 / min         |
   | `login`              | 5 / min          |
   | `logout`             | 20 / min         |
   | `forgot-password`    | 3 / 15 min       |
   | `reset-password`     | 5 / 15 min       |

2. **Email-based Cooldown (MongoDB):** At the service level, we check when the last OTP was generated for a specific email address. If it was less than 20 seconds ago, we reject the request.

3. **OTP Attempt Lockout (MongoDB):** After 5 failed OTP verification attempts, the OTP is invalidated and further attempts are rejected until a new OTP is requested. This isn't rate limiting per se — it's brute-force prevention — but it's part of the layered defense for `verify-otp` and `reset-password`.

Together these layers ensure:

- **DDoS protection:** IP limits stop botnets before they reach MongoDB.
- **Victim protection:** cooldowns prevent one attacker (even with many IPs) from spamming a specific inbox.
- **Brute-force prevention:** attempt counters make 6-digit OTP guessing infeasible.

## Known Trade-off: 429 Reveals Verified Email Existence

`forgot-password` must not leak whether an email is registered (ADR-002 explains why delivery is async for this endpoint specifically). The service returns `200 OK` silently for both non-existent and unverified emails — indistinguishable from the client's perspective, and roughly constant response time.

However, the 20-second cooldown is a **deliberate leak**:

| Request 1 | Request 2 within 20s    | Response sequence | What an attacker learns                       |
| :-------- | :---------------------- | :---------------- | :-------------------------------------------- |
| `200 OK`  | `200 OK`                | `200 → 200`       | Email doesn't exist, OR exists but unverified |
| `200 OK`  | `429 Too Many Requests` | `200 → 429`       | **Verified email exists**                     |

An attacker can probe a target email with two rapid requests and distinguish "verified account" from "no account / unverified" by the second response.

### Why we accept this leak

1. **The cooldown provides real user value.** Without it, a user who doesn't see the first email would mash "Send code" and end up with a flooded inbox. The 20-second wait is the smallest interval that still feels responsive.
2. **The IP rate limit (3 / 15 min) caps the probe rate.** An attacker can distinguish at most one email per 15 minutes per IP. With VPN hopping this scales to a handful per hour — slow, but not zero. The rate limit doesn't eliminate the leak; it bounds the damage.
3. **Only "verified vs. not verified" leaks**, not which user. The attacker learns nothing about identity, password, or session state.
4. **Every mitigation is worse than the leak.** Removing the cooldown hurts UX. Returning `200` on cooldown makes the user think the email was sent when it wasn't — silently frustrating. Adding artificial delays (see ADR-002 rejected alternatives) is fragile and doesn't scale.

This trade-off is documented rather than "fixed" because the alternatives are strictly worse for the common case. If enumeration ever becomes a real threat (high-value accounts, or monitoring shows active probing), the fix is to add a **per-email rate limit** as a fourth layer — not to change the response shape.

## Consequences

### Positive

- **Complete protection:** even if an attacker uses a VPN to bypass the IP rate limiter, the database cooldown prevents them from spamming a specific victim's inbox.
- **Database protection:** the IP rate limiter stops most malicious traffic before it reaches the database, saving compute resources.
- **Brute-force resistance:** the 5-attempt lockout makes 6-digit OTP guessing infeasible (`10^5` search space, 5 attempts per OTP).
- **Documented trade-off:** the 429 enumeration leak is accepted knowingly, not by accident. Future maintainers won't waste time investigating it as a bug.

### Negative

- **Complexity:** state is managed in two places (Upstash Redis and MongoDB), plus the OTP attempt counter.
- **Inconsistent error messages:** the user might receive a `429 Too Many Requests` with two different messages depending on which rate limit they triggered (IP limit vs. cooldown).
- **Small enumeration leak on `forgot-password`:** documented above; accepted because the alternatives are worse.
- **Small enumeration leak on `reset-password`:** submitting a malformed request returns `400 Invalid request.` for non-existent users and `400 OTP has expired or does not exist.` for existing users. Both are 400s, so the leak is weaker than `forgot-password`'s, and it requires the attacker to have already reached the reset stage. Worth knowing; not worth fixing at this stage.

## Alternatives Considered

- **Only IP rate limiting:** rejected. A distributed botnet can easily bypass IP limits.
- **Only database cooldown:** rejected. It still requires the server to process thousands of database queries before rejecting the request, making it vulnerable to DDoS.
- **Per-email rate limit instead of per-IP:** considered. Common industry pattern (Auth0, Firebase), but doesn't stop DDoS — an attacker with a list of emails can hit MongoDB with the same load. Likely to be added as a fourth layer alongside the existing two if enumeration becomes a real concern.
- **Return `200 OK` on cooldown to hide the leak:** rejected. This would make the user think the reset email was sent when it wasn't — worse than the enumeration leak, because it silently affects every legitimate user who triggers the cooldown, not just attackers.
