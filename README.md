# authstack-server

Backend API for the authstack project — an Express + MongoDB service built for serverless deployment on Vercel.

> **Status:** Foundation stage. Routes, middleware, logging, error handling, and deployment pipeline are in place. Authentication features are not yet implemented.

---

## Features

- Express application with security middleware (helmet, CORS)
- MongoDB connection with caching optimized for Vercel serverless
- Winston logger with human-readable dev output and structured JSON in production
- morgan HTTP request logging (`dev` locally, `combined` in production)
- Centralized error handling and JSON 404 responses
- Graceful shutdown on SIGINT/SIGTERM (local)
- Vercel serverless entrypoint (`api/index.js`)
- ESLint (flat config), Prettier, EditorConfig, VS Code settings

---

## Tech Stack

| Layer      | Choice                         |
| :--------- | :----------------------------- |
| Runtime    | Node.js 26 (LTS)               |
| Framework  | Express 5                      |
| Database   | MongoDB (Atlas) via Mongoose   |
| Logging    | Winston + morgan               |
| Validation | Joi                            |
| Security   | helmet, CORS                   |
| Deploy     | Vercel (serverless functions)  |
| Tooling    | ESLint, Prettier, EditorConfig |

---

## Prerequisites

- **Node.js 26.x** — see [`.node-version`](./.node-version)
- **MongoDB Atlas** cluster (or local MongoDB) and a connection string
- **Vercel CLI** (optional, for manual deploys) — `npm i -g vercel`

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
# Edit .env with your values

# 4. Run
npm run dev
```

Verify it's running:

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": 5,
  "database": "connected",
  "environment": "development",
  "version": "1.0.0",
  "node": "v26.x.x",
  "memory": { "rss": "82 MB", "heapUsed": "27 MB" }
}
```

If `database` is not `"connected"`, the MongoDB connection failed — check `MONGODB_URI`.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable      | Required | Default       | Description                                   |
| :------------ | :------: | :------------ | :-------------------------------------------- |
| `NODE_ENV`    |    No    | `development` | `development` \| `production`                 |
| `PORT`        |    No    | `5000`        | Local HTTP port (Vercel manages this in prod) |
| `MONGODB_URI` | **Yes**  | —             | MongoDB Atlas connection string               |

The database name (`authstack`) is configured in `src/config/db.js` via `dbName`, not in the URI. The URI only needs the cluster host.

`.env` is loaded via Node 26's built-in `--env-file` flag — no `dotenv` dependency.

---

## Available Scripts

| Command                | Description                             |
| :--------------------- | :-------------------------------------- |
| `npm run dev`          | Start with auto-reload (`node --watch`) |
| `npm start`            | Start without watch                     |
| `npm run lint`         | Run ESLint                              |
| `npm run lint:cache`   | ESLint with cache (faster repeat runs)  |
| `npm run lint:fix`     | ESLint with auto-fix                    |
| `npm run format`       | Format with Prettier                    |
| `npm run format:check` | Check formatting (no writes)            |

---

## API Endpoints

### `GET /`

Health probe for humans.

**Production:**

```json
{ "status": "ok", "api": "v1" }
```

**Development:**

```json
{
  "status": "ok",
  "service": "authstack",
  "environment": "development",
  "api": "v1",
  "health": "/health"
}
```

### `GET /health`

Health probe with database status.

**Production** — returns **HTTP 503** if DB is down:

```json
{
  "status": "ok",
  "timestamp": "2026-11-06T01:11:54.000Z",
  "uptime": 3600,
  "database": "connected"
}
```

**Development** adds `environment`, `version`, `node`, and `memory` fields.

### Any other path

Returns **404**:

```json
{ "success": false, "message": "Route /missing not found" }
```

---

## Project Structure

```
server/
├── api/
│   └── index.js                  # Vercel serverless entrypoint
├── src/
│   ├── config/
│   │   ├── db.js                 # Cached MongoDB connection
│   │   └── logger.js             # Winston logger + morgan stream
│   ├── controllers/
│   │   ├── health.controller.js
│   │   ├── notFound.controller.js
│   │   └── root.controller.js
│   ├── middlewares/
│   │   └── error.middleware.js
│   ├── routes/
│   │   ├── health.route.js
│   │   ├── notFound.route.js
│   │   └── root.route.js
│   ├── app.js                    # Express app (shared by both entrypoints)
│   └── server.js                 # Local dev entrypoint (listen + graceful shutdown)
├── .env.example
├── .node-version
├── vercel.json
└── package.json
```

**Two entrypoints, one app:**

- `src/server.js` — runs locally via `npm run dev` / `npm start`
- `api/index.js` — invoked by Vercel per request

Both import `src/app.js`, which holds all routes and middleware. Production and local behavior stay identical without duplication.

---

## Deployment

### Vercel

1. Import this repo at [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to the repo root (default — this repo **is** the server)
3. Add environment variables in **Settings → Environment Variables**:
   - `NODE_ENV` = `production`
   - `MONGODB_URI` = your Atlas connection string
4. Deploy

Vercel auto-deploys on every push to `main`.

**MongoDB Atlas network access:** add `0.0.0.0/0` to the IP allowlist to permit Vercel's rotating IPs.

Verify:

```bash
curl https://<your-project>.vercel.app/health
```

---

## License

This project is open source under the **ISC License** — see [LICENSE](./LICENSE) for details.
