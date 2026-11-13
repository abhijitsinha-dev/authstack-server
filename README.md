# authstack-server

Backend API for the authstack project — an Express + MongoDB service built for serverless deployment on Vercel, with a dedicated BullMQ worker for background processing.

> **Status:** Authentication flow (signup, login, refresh, logout, current user) and password reset are fully implemented and tested. Core auth, secure JWT session management, and modular API documentation are production-ready.

---

## Features

- **Authentication:** Secure signup (OTP), login, logout, refresh, and password reset flows with JWT Access/Refresh tokens.
- **Refresh Token Rotation:** Single-use refresh tokens with automatic reuse detection. A replayed (already-rotated) token revokes the entire session — detects token theft.
- **Current User:** `GET /me` for cold-start hydration, so clients can restore session state without a full login round-trip.
- **Password Reset:** Forgot-password + reset-password with 6-digit OTP via email. All active sessions are revoked on successful reset.
- **Multi-Device Sessions:** Tracks active sessions with device info and supports per-session revocation.
- **Background Jobs:** BullMQ + Upstash Redis for asynchronous email delivery (signup, password reset).
- **Defense in Depth:** IP-based rate limiting (Upstash), per-email cooldowns, and OTP brute-force lockout (max 5 attempts).
- **Anti-Enumeration:** `forgot-password` returns `200 OK` regardless of whether the email exists — no timing or status oracle.
- **Dedicated Worker:** Separate Node.js process for processing background jobs.
- **API Documentation:** Modular OpenAPI 3.1 YAML specs served via Swagger UI at `/api-docs`.
- **Testing:** Comprehensive unit + integration test suite (Jest + Supertest) — **99%+ statements, 100% functions**.
- **Production Ready:** Winston logging, centralized error handling, strict env validation, helmet, CORS, graceful shutdowns.

### Security Highlights

- **Atomic OTP consumption** — `findOneAndDelete` prevents concurrent-replay password hijacks.
- **Refresh token reuse detection** — replaying a rotated token revokes the session; detects leaked or cached tokens.
- **Two-tier OTP hashing** — bcrypt for the 6-digit OTP (slow, prevents offline brute-force); SHA-256 for the high-entropy refresh token (fast, allows DB lookup).
- **HTML-escaped emails** — user-supplied `name` is escaped before interpolation, preventing markup injection in transactional emails.
- **Session rotation on reset** — every successful password reset revokes all prior sessions.
- **Explicit OTP expiry check** — code-level `expiresAt` enforcement closes the ~60s lag between a MongoDB TTL sweep and the intended expiry.

---

## Tech Stack

| Layer         | Choice                                   |
| :------------ | :--------------------------------------- |
| Runtime       | Node.js 26 (LTS)                         |
| Framework     | Express 5                                |
| Database      | MongoDB (Atlas) via Mongoose             |
| Queue / Cache | Redis (Upstash) via BullMQ               |
| Auth          | JWT (jsonwebtoken) + Bcrypt              |
| Email Service | Brevo (Transactional Email API)          |
| Validation    | Joi + Validator.js                       |
| Logging       | Winston + morgan                         |
| Documentation | Swagger (swagger-jsdoc + YAML)           |
| Testing       | Jest + Supertest + mongodb-memory-server |
| Deployment    | Vercel (API) + Hostless/Render (Worker)  |

---

## System Architecture

The project is split into two distinct processes to handle the constraints of serverless hosting:

1. **The API (Vercel):** Handles HTTP requests, validates input, manages JWT sessions, and pushes email tasks to Redis. Returns `200 OK` instantly for queued operations.
2. **The Worker (Hostless/Render):** A long-running process that pulls tasks from Redis and sends emails via Brevo.

> **Deep Dive:** For detailed explanations of why we chose this architecture (and our sync vs. async OTP strategy), see the **[Architecture Decision Records (ADRs)](./docs/README.md)** in the `docs/` folder.

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/abhijitsinha-dev/authstack-server.git
cd authstack-server

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your values (MongoDB, Redis, Brevo, JWT Secrets)

# 4. Run the API (Terminal 1)
npm run dev

# 5. Run the Worker (Terminal 2)
npm run worker
```

Verify the API is running:

```bash
curl http://localhost:5000/health
```

Open **`http://localhost:5000/api-docs`** to browse the interactive API documentation.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable                   | Required | Description                                 |
| :------------------------- | :------- | :------------------------------------------ |
| `NODE_ENV`                 | No       | `development` \| `production`               |
| `PORT`                     | No       | Local HTTP port (default `5000`)            |
| `MONGODB_URI`              | **Yes**  | MongoDB Atlas connection string             |
| `BREVO_API_KEY`            | **Yes**  | Brevo API key for sending emails            |
| `BREVO_SENDER_EMAIL`       | **Yes**  | Verified sender email in Brevo              |
| `BREVO_SENDER_NAME`        | No       | Sender display name (default `AuthStack`)   |
| `REDIS_URL`                | **Yes**  | Upstash TCP URL (`rediss://...`) for BullMQ |
| `UPSTASH_REDIS_REST_URL`   | **Yes**  | Upstash REST URL for Rate Limiting          |
| `UPSTASH_REDIS_REST_TOKEN` | **Yes**  | Upstash REST Token for Rate Limiting        |
| `ACCESS_TOKEN_SECRET`      | **Yes**  | Secret for signing short-lived Access JWTs  |
| `REFRESH_TOKEN_SECRET`     | **Yes**  | Secret for signing long-lived Refresh JWTs  |
| `ACCESS_TOKEN_TTL`         | No       | Access token lifespan (default `15m`)       |
| `REFRESH_TOKEN_TTL_DAYS`   | No       | Refresh token lifespan (default `30` days)  |

---

## API Endpoints

All business logic routes are versioned under `/api/v1`. Rate limits shown below are the **production** values; development relaxes them to 100 req/window for manual testing.

### System Routes (Unversioned)

- `GET /` — Basic status probe. Production: `{ status, api }`. Development adds `{ service, environment, health }`.
- `GET /health` — Detailed health probe. Production returns `503` when the DB is disconnected; development always returns `200` (with `status: "degraded"` and extra diagnostics like memory usage).
- `GET /api-docs` — Swagger UI.
- `GET /api-docs.json` — Raw OpenAPI spec.

### Auth Routes (`/api/v1/auth`)

#### Signup

**`POST /signup/request-otp`**

- **Body:** `{ name, email, password }`
- **Description:** Creates an unverified user, generates an OTP, and pushes a job to BullMQ (async).
- **Rate Limit:** 5 req/min.
- **Errors:** `400` (validation), `409` (email already registered), `429` (rate limit), `500` (server / email).

**`POST /signup/resend-otp`**

- **Body:** `{ email }`
- **Description:** Generates a new OTP and sends it **synchronously** via Brevo to guarantee delivery feedback.
- **Rate Limit:** 1 req/20 sec + per-email database cooldown.
- **Errors:** `400` (already verified), `404` (user not found), `429` (cooldown), `500` (email failure).

**`POST /signup/verify-otp`**

- **Body:** `{ email, otp }`
- **Description:** Verifies the OTP, marks the user as verified, creates a secure multi-device session, and issues JWTs. Web clients get an `HttpOnly` refresh cookie; mobile clients receive the refresh token in the JSON body.
- **Rate Limit:** 10 req/min.
- **Errors:** `400` (invalid/expired OTP), `404` (user not found), `429` (lockout).

#### Session

**`POST /login`**

- **Body:** `{ email, password }`
- **Description:** Authenticates the user. Returns an Access Token and sets a Refresh Token (HttpOnly cookie for web, JSON for mobile).
- **Rate Limit:** 5 req/min.
- **Errors:** `400` (validation), `401` (invalid credentials), `403` (email not verified), `429` (rate limit), `500`.

**`POST /refresh`**

- **Body:** None for web (cookie sent automatically). `{ refreshToken }` for mobile.
- **Description:** Rotates the refresh token and issues a new access token. The old refresh token is invalidated — clients must persist the new one.
- **Reuse detection:** presenting an already-rotated token revokes the entire session, catching stolen or stale tokens.
- **Rate Limit:** 30 req/min (higher than other endpoints — called automatically on cold start and every 15-min access-token expiry).
- **Errors:** `401` (no token, invalid/expired, session revoked, **reuse detected**), `429`, `500`.

**`GET /me`**

- **Requires:** Bearer Token
- **Description:** Returns the authenticated user's profile. Used on cold start to hydrate client UI state without a full login round-trip. Response is `Cache-Control: no-store`.
- **Rate Limit:** 60 req/min.
- **Errors:** `401` (unauthorized, session revoked, or user deleted), `429`, `500`.

**`POST /logout`**

- **Requires:** Bearer Token
- **Description:** Revokes the current session in the database and clears the refresh-token cookie.
- **Rate Limit:** 20 req/min.
- **Errors:** `401` (unauthorized), `404` (session already gone), `500`.

#### Password Reset

**`POST /forgot-password`**

- **Body:** `{ email }`
- **Description:** Generates a 6-digit reset OTP and queues it via BullMQ.
- **Anti-enumeration:** Always returns `200 OK` — an attacker cannot distinguish "email exists" from "email doesn't exist" via status, body, or timing.
- **Rate Limit:** 3 req/15 min + per-email 20 sec cooldown.
- **Errors:** `400` (invalid email format), `429` (cooldown or rate limit), `500`.

**`POST /reset-password`**

- **Body:** `{ email, otp, newPassword, confirmPassword }`
- **Description:** Verifies the OTP and updates the password. **All active sessions are revoked** on success.
- **Rate Limit:** 5 req/15 min.
- **Errors:** `400` (validation, invalid/expired/used OTP), `429` (lockout or rate limit), `500`.
- **Atomic consume:** the OTP is deleted with `findOneAndDelete` _before_ the password is written — a concurrent replay cannot hijack the reset.

---

## API Documentation Notes

Swagger is powered by **`swagger-jsdoc`**. To keep our Express route files clean, we do **not** write massive JSDoc blocks inside our `.js` files.

Instead, we use a **modular YAML approach**:

- Base configuration (info, servers, security) lives in `src/config/swagger.js`
- All paths, schemas, and responses live in the `docs/api/` folder
- Files are grouped by domain (e.g., `docs/api/auth/`, `docs/api/system/`)
- Shared components live in `docs/api/components/` (`global.responses.yaml`, `global.schemas.yaml`)

To add a new endpoint:

1. Write the Express route in `src/routes/`
2. Add the route definition to the corresponding `.paths.yaml` file in `docs/api/`
3. Run `npm run dev` — the spec is rebuilt in memory at startup.

---

## Available Scripts

| Command          | Description                                 |
| :--------------- | :------------------------------------------ |
| `npm run dev`    | Start API with auto-reload (`node --watch`) |
| `npm start`      | Start API without watch                     |
| `npm run worker` | Start the BullMQ background worker          |
| `npm test`       | Run the Jest test suite                     |
| `npm run lint`   | Run ESLint                                  |
| `npm run format` | Format with Prettier                        |

---

## Project Structure

```text
server/
├── api/
│   └── index.js                  # Vercel serverless entrypoint (503 on DB failure)
├── worker/
│   └── index.js                  # BullMQ worker entrypoint (Hostless)
├── docs/
│   ├── api/                      # Modular OpenAPI 3.1 YAML specs
│   │   ├── components/           # Reusable schemas & responses
│   │   ├── auth/                 # Auth paths, schemas, responses
│   │   └── system/               # Health & root paths
│   ├── decisions/                # Architecture Decision Records (ADRs)
│   ├── README.md                 # Docs hub
│   └── COMMIT_CONVENTION.md      # Git conventions
├── src/
│   ├── config/                   # DB, Logger, Rate Limiter, Swagger
│   ├── controllers/              # Route handlers
│   ├── middlewares/              # Auth, Validation, Error, Rate Limiting
│   ├── models/                   # Mongoose schemas
│   │   ├── user.model.js
│   │   ├── otp.model.js          # purpose: 'signup' | 'reset' + compound index
│   │   └── session.model.js      # isRevoked + revokedAt for session revocation
│   ├── queues/                   # BullMQ queue definitions
│   ├── routes/                   # Express routers (code-only, no JSDoc)
│   ├── services/                 # Business logic (Auth, Email)
│   ├── utils/                    # Helpers (ApiError, JWT, OTP, Validators)
│   ├── validators/               # Joi validation schemas
│   ├── app.js                    # Express app configuration
│   └── server.js                 # Local dev entrypoint
├── tests/                        # Jest test suites (Unit & Integration)
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── validators/
├── .env.example
├── .node-version
├── jest.config.js
├── jest.setup.js
├── vercel.json
└── package.json
```

---

## Deployment

### API (Vercel)

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add all environment variables (`MONGODB_URI`, `BREVO_*`, `REDIS_URL`, `UPSTASH_*`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`).
3. Deploy. Vercel will automatically use `api/index.js`.

The API returns `503` (with `Retry-After: 30`) if MongoDB is unreachable at cold start, instead of a generic `500`. This makes outages distinguishable from code bugs in monitoring.

### Worker (Hostless / Render / Railway)

Because Vercel functions are ephemeral and cannot maintain persistent TCP connections, the worker must be hosted separately.

1. Create a new **Background Worker** on your chosen platform.
2. Connect this same GitHub repository.
3. Set the **Start Command** to: `node worker/index.js`
4. Add the same environment variables (especially `REDIS_URL`, `MONGODB_URI`, `BREVO_*`, and `ACCESS_TOKEN_SECRET`).

The worker handles two job types: `send-otp` (signup) and `send-reset-otp` (password reset).

---

## Contributing

We welcome contributions of all kinds! Please read our **[Contributing Guide](./CONTRIBUTING.md)** to learn about our development setup, branch naming conventions, and the **[Commit Convention](./docs/COMMIT_CONVENTION.md)** we use to keep our Git history clean.

---

## License

This project is open source under the **ISC License** — see [LICENSE](./LICENSE) for details.
