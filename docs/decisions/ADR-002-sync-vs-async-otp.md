# ADR-002: Async vs. Sync OTP Delivery

## Status

**Accepted** (November 2026)

## Context

We have two OTP endpoints: `request-otp` (initial signup) and `resend-otp` (when a user doesn't receive the code). Sending emails via Brevo is a slow network operation. If we block the HTTP request while waiting for Brevo, the API latency spikes.

## Decision

We will use a hybrid approach:

1. **`request-otp`:** Use an asynchronous queue (BullMQ). The user is expecting a fast signup, and a 1-2 second delay is acceptable. The API pushes the job to Redis and returns `200 OK` immediately.
2. **`resend-otp`:** Use synchronous delivery (`await`). The user is already frustrated because they didn't get the first email. We want to guarantee the email is sent before returning a `200 OK`. If Brevo fails, we return a `500` immediately so the user knows to try again.

## Consequences

### Positive

- **Best User Experience:** The initial signup is blazing fast, while the resend action provides immediate, guaranteed feedback.
- **Resilience:** The resend endpoint leverages Brevo's SDK built-in retries (with a short timeout) to handle transient network blips instantly.

### Negative

- **Inconsistent Architecture:** The codebase handles email delivery in two different ways (async vs. sync), which requires a slightly deeper understanding from contributors.
- **Latency on Resend:** The `/resend-otp` endpoint response time is now directly tied to Brevo's API latency (often 1-3 seconds).

## Alternatives Considered

- **Fully Async (Queue for both):** Rejected. If the worker or Brevo is down, the user clicks "Resend" and gets a `200 OK`, but no email ever arrives. This is a terrible user experience.
- **Fully Sync (No Queue for either):** Rejected. It makes the initial signup endpoint vulnerable to Brevo outages, causing massive latency for all users.
