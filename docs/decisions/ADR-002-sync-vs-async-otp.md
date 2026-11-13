# ADR-002: Async vs. Sync OTP Delivery

## Status

**Accepted** (November 2026)

## Context

We have three OTP endpoints, all of which send a 6-digit code via Brevo:

| Endpoint                   | When called                         | Who calls it                                      |
| :------------------------- | :---------------------------------- | :------------------------------------------------ |
| `POST /signup/request-otp` | Initial signup                      | A new user with no account yet                    |
| `POST /signup/resend-otp`  | User didn't receive the first email | A user mid-signup (account exists but unverified) |
| `POST /forgot-password`    | User forgot their password          | An existing, verified user                        |

Sending an email via Brevo is a slow network operation — typically 1–3 seconds, up to the SDK's 10-second timeout. If we block the HTTP request while waiting for Brevo, the API latency spikes and the endpoint becomes vulnerable to Brevo outages.

The naive approach is "pick one delivery mode and be consistent." We rejected that: each endpoint has different constraints, and forcing uniformity produces a worse outcome for at least one of them.

## Decision

We use a **per-endpoint hybrid** approach, driven by two factors:

1. **User emotional state** — happy-but-impatient (signup) vs. frustrated (didn't get the email).
2. **Enumeration surface** — can response status or timing leak whether an email exists?

| Endpoint          | Delivery           | Reason                                                                                                                       |
| :---------------- | :----------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `request-otp`     | **Async** (BullMQ) | Fast signup is the goal; enumeration is irrelevant (the user is telling us their email for the first time).                  |
| `resend-otp`      | **Sync** (`await`) | Frustrated user needs guaranteed delivery; enumeration is irrelevant (the user _just_ created the account).                  |
| `forgot-password` | **Async** (BullMQ) | **Enumeration is the dominant constraint** — sync would leak "verified email exists" via both status code and response time. |

### Why `forgot-password` is different from `resend-otp`

Both are "I didn't get my OTP" flows, so the intuition says they should behave the same. They must not, because the enumeration surfaces are fundamentally different:

- **`resend-otp`**: the caller _just_ created the account. Both parties already know the email exists, so a `404` or a slow response leaks nothing.
- **`forgot-password`**: we deliberately return `200 OK` for non-existent and unverified emails (silent anti-enumeration in `requestPasswordReset`). Making delivery sync would undo that:

  | Scenario                       | Sync behavior                       | Leak              |
  | :----------------------------- | :---------------------------------- | :---------------- |
  | Email doesn't exist            | Silent `200`, no Brevo call (~50ms) | —                 |
  | Email verified, Brevo succeeds | `200` after 1–3s                    | **Timing oracle** |
  | Email verified, Brevo fails    | `500`                               | **Status oracle** |

  In both verified-email cases, an attacker learns the email exists — defeating the entire anti-enumeration layer. Async delivery pushes the Brevo call into the worker, so the HTTP response is a constant `200 OK` in roughly constant time regardless of email existence or Brevo health.

## Consequences

### Positive

- **Best UX per endpoint:** signup returns in ~100ms; resend gives immediate guaranteed feedback; forgot-password returns instantly and masks all downstream variance.
- **Resilience:** `resend-otp` leverages Brevo's SDK retries (3 attempts, 10s timeout) with hard failures surfacing as `500`. Worker jobs for `request-otp` and `forgot-password` survive Brevo outages — jobs sit in Redis and retry without affecting the user.
- **Anti-enumeration holds:** `forgot-password` is a constant-time, constant-status endpoint. Status and timing oracles are impossible by construction.

### Negative

- **Inconsistent Architecture:** three endpoints, two delivery modes. The rationale for each is non-obvious without reading this ADR.
- **Latency on Resend:** the `/resend-otp` response time is directly tied to Brevo's API latency (typically 1–3 seconds).
- **Silent failures on Forgot-Password:** if the worker or Brevo is down, the user gets `200 OK` but no email arrives. Unlike `resend-otp`, they cannot distinguish "on its way" from "failed." Mitigated by: (a) the 20-second per-email cooldown and 3-per-15-minute per-IP rate limit let the user retry without penalty; (b) the worker's 3-attempt exponential backoff resolves transient Brevo blips automatically.
- **Monitoring requirement:** async failures are invisible to the caller and surface only in worker logs. Production monitoring must alert on `Worker failed` events, not just HTTP 5xx rates.

## Alternatives Considered

- **Fully async (queue all three):** rejected. If the worker or Brevo is down, the user clicks "Resend" and gets `200 OK`, but no email arrives. Terrible UX for someone already frustrated. `resend-otp` must be sync.

- **Fully sync (no queue at all):** rejected. It makes signup and forgot-password vulnerable to Brevo outages, causes latency spikes for all users, and — critically — turns `forgot-password` into an enumeration oracle (see table above).

- **Fully async including forgot-password — _our chosen path_:** selected. Preserves anti-enumeration on `forgot-password` while keeping signup fast. The trade-off is silent failure if the worker is down, which we accept in exchange for closing the enumeration hole.

- **`forgot-password` sync with an artificial delay** (sleeping to match Brevo's typical latency, hiding the timing oracle): rejected. Fragile — can't hide the `500` status oracle when Brevo actually fails, and artificially inflates latency for every legitimate user.

- **`forgot-password` with a two-phase confirmation queue** (`202 Accepted` + client polls for delivery status): considered, rejected as over-engineering. Adds a polling protocol, a new state store, and client complexity — all to solve the silent-failure problem that the cooldown + rate limit already mitigate for practical purposes.
