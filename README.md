# authstack-server

Backend API for the authstack project — an Express + MongoDB service built for serverless deployment on Vercel.

> **Status:** Foundation stage. Routes, middleware, logging, error handling, deployment pipeline, and API documentation are in place. Authentication features are not yet implemented.

---

## Features

- Express application with security middleware (helmet, CORS)
- MongoDB connection with caching optimized for Vercel serverless
- Winston logger with human-readable dev output and structured JSON in production
- morgan HTTP request logging (`dev` locally, `combined` in production)
- Centralized error handling and JSON 404 responses
- Graceful shutdown on SIGINT/SIGTERM (local)
- **Interactive API documentation via Swagger UI at `/api-docs`**
- **Raw OpenAPI 3.0 spec available at `/api-docs.json`**
- Vercel serverless entrypoint (`api/index.js`)
- ESLint (flat config), Prettier, EditorConfig, VS Code settings

---

## Tech Stack

| Layer         | Choice                                       |
| :------------ | :------------------------------------------- |
| Runtime       | Node.js 26 (LTS)                             |
| Framework     | Express 5                                    |
| Database      | MongoDB (Atlas) via Mongoose                 |
| Logging       | Winston + morgan                             |
| Documentation | Swagger (swagger-jsdoc + swagger-ui-express) |
| Security      | helmet, CORS                                 |
| Deploy        | Vercel (serverless functions)                |
| Tooling       | ESLint, Prettier, EditorConfig               |

> `joi`, `jsonwebtoken`, `bcryptjs`, and `@getbrevo/brevo` are installed but not yet wired into the app — they'll be used by the upcoming authentication features.

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

Then open **`http://localhost:5000/api-docs`** to browse the interactive API documentation.

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

### `GET /api-docs`

Interactive Swagger UI for exploring and testing the API. Served in both development and production.

Assets (CSS/JS) are loaded from **cdnjs** rather than the local `node_modules/swagger-ui-dist` folder, because Vercel's serverless runtime does not reliably serve bundled static assets. This is a documented workaround, not a configuration error.

### `GET /api-docs.json`

The raw OpenAPI 3.0 specification as JSON. Useful for:

- Client code generation (openapi-generator, orval)
- Importing into Postman / Insomnia
- Contract testing tools
- Feeding into other documentation renderers (Redoc, Scalar)

### Any other path

Returns **404**:

```json
{ "success": false, "message": "Route /missing not found" }
```

---

## API Documentation Notes

Swagger is powered by two packages:

- **`swagger-jsdoc`** — parses `@swagger` JSDoc comments in `src/routes/*.js` and builds the spec at startup
- **`swagger-ui-express`** — serves the interactive UI at `/api-docs`

The spec is generated **in memory at runtime** — there is no `.json` file on disk. It's available via the `/api-docs.json` endpoint whenever the server is running.

### Adding documentation for a new endpoint

Add a `@swagger` JSDoc block above the route handler in the corresponding `src/routes/*.route.js` file:

```javascript
/**
 * @swagger
 * /example:
 *   get:
 *     summary: One-line description
 *     tags: [Example]
 *     responses:
 *       200:
 *         description: Success
 */
router.route('/').get(exampleHandler);
```

The spec is regenerated automatically on the next server restart — no build step or CLI command needed.

### Security consideration

`/api-docs` and `/api-docs.json` are served in **both development and production**. This is intentional for a portfolio project — reviewers can explore the API without cloning the repo.

**For a production API handling real user data**, this is a security risk: the docs reveal every endpoint, parameter, and schema. Mitigate by:

- Adding auth (basic auth, JWT) to the `/api-docs` routes
- Restricting to internal IPs
- Disabling the UI entirely in production and serving only the JSON spec behind auth

### Disabling Swagger UI in production

If needed later, wrap the Swagger mount in a guard:

```javascript
if (!isProduction) {
  app.use('/api-docs' /* ... */);
}
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
│   │   ├── logger.js             # Winston logger + morgan stream
│   │   └── swagger.js            # Swagger/OpenAPI configuration
│   ├── controllers/
│   │   ├── health.controller.js
│   │   ├── notFound.controller.js
│   │   └── root.controller.js
│   ├── middlewares/
│   │   └── error.middleware.js
│   ├── routes/
│   │   ├── health.route.js       # + @swagger annotations
│   │   ├── index.route.js        # Routes aggregator
│   │   ├── notFound.route.js     # Not documented — infrastructure only
│   │   └── root.route.js         # + @swagger annotations
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

**Routes aggregator:**

`src/routes/index.route.js` mounts all routers in one place. `app.js` mounts it once with `app.use(indexRoute)`. Adding a new router (e.g., `/auth`) means editing `index.route.js`, not `app.js`.

---

## Dependencies

### Security overrides

`package.json` pins two transitive packages to patched versions:

```json
"overrides": {
  "minimatch": "^11.0.4",
  "glob": "^14.0.2"
}
```

These resolve advisories in dependencies pulled in by ESLint and `swagger-jsdoc`. If `npm audit` reports a new transitive vulnerability, add an override for that package specifically — do not run `npm audit fix --force`, which jumps across major versions and can break things silently.

### Install script approval

`@scarf/scarf` (a transitive dependency of `swagger-jsdoc`) ships a `postinstall` script that reports anonymous usage telemetry. It's blocked by default via:

```json
"allowScripts": {
  "@scarf/scarf": false
}
```

This is npm's standard mechanism for reviewing install-time scripts — recommended for any new dependency that includes one.

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
curl https://<your-project>.vercel.app/api-docs.json
```

Open **`https://<your-project>.vercel.app/api-docs`** to view the Swagger UI in production.

---

## License

This project is open source under the **ISC License** — see [LICENSE](./LICENSE) for details.
