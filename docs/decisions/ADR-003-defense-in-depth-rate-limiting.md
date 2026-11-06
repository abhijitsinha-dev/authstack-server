# ADR-003: Defense-in-Depth Rate Limiting

## Status

**Accepted** (November 2026)

## Context

We need to protect our authentication endpoints from abuse. Without rate limiting, an attacker could:

1. DDoS our API, causing our MongoDB database to crash under the load of thousands of queries.
2. Spam a specific user's email address, burning through our Brevo email quota and harassing the user.

## Decision

We will implement two independent layers of rate limiting:

1. **IP-based Rate Limiting (Upstash):** At the route middleware level, we use `@upstash/ratelimit` to restrict the number of requests a single IP address can make (e.g., 5 requests per minute). This stops botnets and DDoS attacks at the edge.
2. **Email-based Cooldown (MongoDB):** At the service level, we check when the last OTP was generated for a specific email address. If it was less than 20 seconds ago, we reject the request.

## Consequences

### Positive

- **Complete Protection:** Even if an attacker uses a VPN to bypass the IP rate limiter, the database cooldown prevents them from spamming a specific victim's inbox.
- **Database Protection:** The IP rate limiter stops most malicious traffic before it even reaches the database, saving compute resources.

### Negative

- **Complexity:** Requires managing state in two different places (Upstash Redis and MongoDB).
- **Inconsistent Error Messages:** The user might receive a `429 Too Many Requests` with two different messages depending on which rate limit they triggered.

## Alternatives Considered

- **Only IP Rate Limiting:** Rejected. A distributed botnet can easily bypass IP limits.
- **Only Database Cooldown:** Rejected. It still requires the server to process thousands of database queries before rejecting the request, making it vulnerable to DDoS.
