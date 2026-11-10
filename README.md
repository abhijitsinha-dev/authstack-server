# authstack-server

Backend API for the authstack project — an Express + MongoDB service built for serverless deployment on Vercel, with a dedicated BullMQ worker for background processing.

> **Status:** Authentication Flow (Signup, Login, Logout). The core authentication, secure JWT session management, and modular API documentation are fully implemented and tested.

---

## Features

- **Authentication:** Secure signup (OTP), login, and logout flows with JWT Access/Refresh tokens.
- **Multi-Device Sessions:** Tracks active sessions with device info and supports session revocation.
- **Background Jobs:** BullMQ + Upstash Redis for asynchronous email delivery.
- **Defense in Depth:** IP-based rate limiting (Upstash), email cooldowns, and OTP brute-force lockout (max 5 attempts).
- **Dedicated Worker:** Separate Node.js process for processing background jobs.
- **API Documentation:** Modular OpenAPI 3.0 YAML specs served via Swagger UI at `/api-docs`.
- **Testing:** Comprehensive unit and integration test suite (Jest + Supertest) with ~96% coverage.
- **Production Ready:** Winston logging, centralized error handling, strict env validation, helmet, CORS, and graceful shutdowns.

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

1. **The API (Vercel):** Handles HTTP requests, validates input, manages JWT sessions, and pushes email tasks to Redis. Returns `200 OK` instantly.
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

All business logic routes are versioned under `/api/v1`.

### System Routes (Unversioned)

- `GET /` — Basic health probe.
- `GET /health` — Detailed health probe with DB status.
- `GET /api-docs` — Swagger UI.
- `GET /api-docs.json` — Raw OpenAPI spec.

### Auth Routes (`/api/v1/auth`)

**`POST /signup/request-otp`**

- **Body:** `{ name, email, password }`
- **Description:** Creates an unverified user, generates an OTP, and pushes a job to BullMQ.
- **Rate Limit:** 5 req/min.

**`POST /signup/resend-otp`**

- **Body:** `{ email }`
- **Description:** Generates a new OTP and sends it **synchronously** via Brevo to ensure immediate feedback.
- **Rate Limit:** 1 req/20 sec + Database cooldown.

**`POST /signup/verify-otp`**

- **Body:** `{ email, otp }`
- **Description:** Verifies the OTP. Marks the user as verified, creates a secure multi-device session, and issues JWTs. Web clients receive an `HttpOnly` cookie; mobile clients receive the refresh token in the JSON body.
- **Rate Limit:** 10 req/min.

**`POST /login`**

- **Body:** `{ email, password }`
- **Description:** Authenticates the user. Returns an Access Token and sets a Refresh Token (HttpOnly cookie for Web, JSON for Mobile).
- **Rate Limit:** 5 req/min.

**`POST /logout`**

- **Requires:** Bearer Token (Protected Route)
- **Description:** Revokes the current session in the database and clears the refresh token cookie.

---

## API Documentation Notes

Swagger is powered by **`swagger-jsdoc`**. To keep our Express route files clean, we do **not** write massive JSDoc blocks inside our `.js` files.

Instead, we use a **modular YAML approach**:

- Base configuration (info, servers, security) lives in `src/config/swagger.js`
- All paths, schemas, and responses live in the `docs/api/` folder
- Files are grouped by domain (e.g., `docs/api/auth/`, `docs/api/system/`)

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
│   └── index.js                  # Vercel serverless entrypoint
├── worker/
│   └── index.js                  # BullMQ worker entrypoint (Hostless)
├── docs/
│   ├── api/                      # Modular OpenAPI 3.0 YAML specs
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
│   ├── models/                   # Mongoose schemas (User, Otp, Session)
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

### Worker (Hostless / Render / Railway)

Because Vercel functions are ephemeral and cannot maintain persistent TCP connections, the worker must be hosted separately.

1. Create a new **Background Worker** on your chosen platform.
2. Connect this same GitHub repository.
3. Set the **Start Command** to: `node worker/index.js`
4. Add the same environment variables (especially `REDIS_URL`, `MONGODB_URI`, `BREVO_*`, and `ACCESS_TOKEN_SECRET`).

---

## Contributing

We welcome contributions of all kinds! Please read our **[Contributing Guide](./CONTRIBUTING.md)** to learn about our development setup, branch naming conventions, and the **[Commit Convention](./docs/COMMIT_CONVENTION.md)** we use to keep our Git history clean.

---

## License

This project is open source under the **ISC License** — see [LICENSE](./LICENSE) for details.
