# ADR-006: Auth and User Route Boundaries

## Status

**Accepted** (November 2026)

## Context

Authentication and session endpoints shared a route namespace with user
profile and account-data operations. This made it less clear which endpoints
manage identity and sessions and which endpoints read or update a user's
resource.

## Decision

Keep identity, credential, token, and session operations under
`/api/v1/auth`. This includes signup and verification, login, refresh, logout,
password recovery, and session management. Signup availability checks remain
under `/auth` because they support account registration.

Place authenticated user resource operations under `/api/v1/users`. Use
`GET /users/me` to fetch the current user's profile and `PATCH /users/me` to
update profile fields. Account-specific updates use their own PATCH routes:
`/users/me/username`, `/users/me/email`, and `/users/me/password`. Email
verification remains a separate step at `/users/me/email/verify-otp`.

Document auth and user endpoints in their corresponding `docs/api/auth/` and
`docs/api/users/` OpenAPI YAML directories.

## Consequences

### Positive

- Route ownership distinguishes identity/session actions from user resource data.
- User profile and account updates share a consistent resource-oriented namespace.
- OpenAPI paths are grouped by the route domain.

### Negative

- Existing clients must update calls to the moved user endpoints and use PATCH
  for username, email, and password changes.
- Signup availability checks remain in the auth namespace even though they
  query user fields, since they are part of registration.
