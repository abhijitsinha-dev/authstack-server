# ADR-006: Reserve Usernames During Signup Verification

## Status

**Accepted** (November 2026)

## Context

Signup creates a user account before the user verifies their email. Without an expiry policy, an abandoned signup could reserve a username indefinitely. Releasing it immediately would let another person take a username while its original registrant is still able to complete verification.

## Decision

An unverified account reserves its username for up to 24 hours. MongoDB removes unverified user documents through a TTL index on `createdAt` with a partial filter for `isVerified: false`. MongoDB's TTL monitor runs in the background, so removal may happen shortly after the 24-hour boundary rather than at an exact instant. Verified accounts are not covered by this TTL index.

Signup checks the submitted email and username before creating the pending account:

1. **New email and new username:** Create an unverified account and queue its OTP email. The username is reserved while this account is pending.
2. **Different email, username belongs to a pending account:** Reject the request with a username conflict. The pending account may still be verified during its 24-hour reservation period.
3. **Same email as a pending account:** Treat the request as a retry of the unfinished signup. Remove the old pending record, create a new pending account, and queue a fresh OTP. The requester may reuse that username or choose another available username. If the chosen username belongs to a different email, reject it with a username conflict.
4. **Email or username belongs to a verified account:** Do not replace the verified account. Return a conflict for the matching email or username.

Unique database indexes on email and username remain the final protection against concurrent signup requests. A duplicate-key race is returned as a generic `409` asking the requester to retry.

## Examples

| Existing account                               | Signup request                         | Result                                                                         |
| :--------------------------------------------- | :------------------------------------- | :----------------------------------------------------------------------------- |
| None                                           | `river.lee` / `river.lee@example.com`  | Create pending account and queue OTP.                                          |
| Pending `river.lee` / `river.lee@example.com`  | `river.lee` / `river.alt@example.net`  | Reject: username is reserved by the other pending account.                     |
| Pending `river.lee` / `river.lee@example.com`  | `river.lee` / `river.lee@example.com`  | Replace pending account and queue a fresh OTP.                                 |
| Pending `river.lee` / `river.lee@example.com`  | `riverlee2` / `river.lee@example.com`  | Replace pending account with the new available username and queue a fresh OTP. |
| Verified `river.lee` / `river.lee@example.com` | Any username / `river.lee@example.com` | Reject: email already belongs to a verified account.                           |
| Verified account owns `river.lee`              | `river.lee` / another email            | Reject: username is already taken.                                             |

## Consequences

### Positive

- An abandoned signup cannot reserve a username indefinitely.
- A pending signup cannot be displaced by a different email before its verification window ends.
- Users can recover from an unfinished signup by retrying with the same email, including changing to another available username.
- Verified accounts retain their usernames and emails.

### Negative

- A username remains unavailable to other email addresses until the pending record is verified or MongoDB's TTL monitor removes it.
- Concurrent signups can still race between the ownership checks and account creation; unique indexes catch the race and the API returns a retryable conflict.
