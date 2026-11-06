# authstack-server

Backend API for the authstack project — an Express + MongoDB service built for serverless deployment on Vercel, with a dedicated BullMQ worker for background processing.

> **Status:** Authentication Flow (Signup). The OTP request and resend flows are fully implemented. JWT generation and OTP verification are next.

---

## Features

- **Authentication:** Signup flow with secure 6-digit OTPs sent via Brevo.
- **Background Jobs:** BullMQ + Upstash Redis for asynchronous email delivery.
- **Defense in Depth:** IP-based rate limiting (Upstash) + Email-based cooldowns (MongoDB).
- **Dedicated Worker:** Separate Node.js process for processing background jobs.
- **API Documentation:** Interactive Swagger UI available at `/api-docs`.
- **Production Ready:** Winston logging, centralized error handling, helmet, CORS, and graceful shutdowns.

---

## Tech Stack

| Layer         | Choice                                  |
| :------------ | :-------------------------------------- |
| Runtime       | Node.js 26 (LTS)                        |
| Framework     | Express 5                               |
| Database      | MongoDB (Atlas) via Mongoose            |
| Queue / Cache | Redis (Upstash) via BullMQ              |
| Email Service | Brevo (Transactional Email API)         |
| Validation    | Joi                                     |
| Logging       | Winston + morgan                        |
| Documentation | Swagger (swagger-jsdoc)                 |
| Deployment    | Vercel (API) + Hostless/Render (Worker) |

---

## System Architecture

The project is split into two distinct processes to handle the constraints of serverless hosting:

1. **The API (Vercel):** Handles HTTP requests, validates input, and pushes email tasks to Redis. Returns `200 OK` instantly.
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
# Edit .env with your values (MongoDB, Redis, Brevo)

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

---

## Available Scripts

| Command          | Description                                 |
| :--------------- | :------------------------------------------ |
| `npm run dev`    | Start API with auto-reload (`node --watch`) |
| `npm start`      | Start API without watch                     |
| `npm run worker` | Start the BullMQ background worker          |
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
├── docs/                         # Architecture Decision Records (ADRs)
├── src/
│   ├── config/                   # DB, Logger, Rate Limiter, Swagger
│   ├── controllers/              # Route handlers
│   ├── middlewares/              # Auth, Validation, Error, Rate Limiting
│   ├── models/                   # Mongoose schemas (User, Otp, Session)
│   ├── queues/                   # BullMQ queue definitions
│   ├── routes/                   # Express routers
│   ├── services/                 # Business logic (Auth, Email)
│   ├── utils/                    # Helpers (ApiError, Token generation)
│   ├── validators/               # Joi validation schemas
│   ├── app.js                    # Express app configuration
│   └── server.js                 # Local dev entrypoint
├── .env.example
├── .node-version
├── vercel.json
└── package.json
```

---

## Deployment

### API (Vercel)

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Add all environment variables (`MONGODB_URI`, `BREVO_*`, `REDIS_URL`, `UPSTASH_*`).
3. Deploy. Vercel will automatically use `api/index.js`.

### Worker (Hostless / Render / Railway)

Because Vercel functions are ephemeral and cannot maintain persistent TCP connections, the worker must be hosted separately.

1. Create a new **Background Worker** on your chosen platform.
2. Connect this same GitHub repository.
3. Set the **Start Command** to: `node worker/index.js`
4. Add the same environment variables (especially `REDIS_URL`, `MONGODB_URI`, and `BREVO_*`).

---

## License

This project is open source under the **ISC License** — see [LICENSE](./LICENSE) for details.
