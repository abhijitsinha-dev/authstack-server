# ADR-001: Separating the API and Background Worker

## Status

**Accepted** (November 2026)

## Context

The authstack application requires sending transactional emails (OTPs) using Brevo. Sending an email over the network is a time-consuming operation (often taking 1–3 seconds).

Our primary API is hosted on **Vercel** (a Serverless platform). We use **BullMQ** to manage the email queue and **Upstash Redis** as the queue store to keep the API fast and decoupled.

However, we encountered a fundamental architectural constraint:

1. **Serverless Limits:** Vercel functions are ephemeral. They spin up, handle a request, and shut down. They have strict execution time limits (e.g., 10–300 seconds) and cannot maintain the persistent, blocking TCP connection required by a BullMQ worker to listen for jobs.
2. **Network Constraints:** If we attempted to run the BullMQ worker inside a standard Vercel function, the function would time out and be killed, leaving jobs unprocessed.

## Decision

We will decouple the architecture into two distinct deployment targets, sharing the same codebase:

1. **The Producer (API):** The Express API is deployed to **Vercel**. Its only job regarding background tasks is to push a job payload to Upstash Redis and immediately return a `200 OK` to the client.
2. **The Consumer (Worker):** A dedicated Node.js process (`worker/index.js`) is deployed to a long-running hosting provider (currently **Hostless**). This process connects to Upstash Redis, listens for jobs, and processes the Brevo email sending.

Both processes share the same `src/` directory (services, models, config) to avoid code duplication.

## Consequences

### Positive

- **Fast API Responses:** The API is no longer blocked by Brevo's latency. The signup endpoint returns in ~100ms.
- **Reliability:** If Brevo goes down, the jobs remain safely in Redis. The Hostless worker will automatically retry them without the user being affected.
- **No Cold Starts for Jobs:** The worker stays online 24/7, meaning background jobs are processed instantly when added to the queue.

### Negative

- **Deployment Complexity:** We now have two deployment targets to manage. A single change might require updating both Vercel and Hostless.
- **Environment Duplication:** Both platforms require their own set of environment variables (MongoDB URI, Redis URL, Brevo keys), which must be kept in sync.
- **Cost:** While currently on free tiers, running a persistent worker will eventually require a paid hosting plan (unlike the API, which can comfortably stay on Vercel's free tier).

## Alternatives Considered

- **Running the Worker inside a Vercel Serverless Function:** Rejected. The function would time out, and Vercel does not support the persistent TCP connections required by BullMQ.
- **Using a Serverless-Native Queue (e.g., Trigger.dev, Inngest):** Considered. While it removes the need for a dedicated worker server, it requires rewriting the queue logic and moving away from the industry-standard BullMQ/Redis pattern, which is a valuable skill to demonstrate.
- **Awaiting the Email in the API (No Queue):** Rejected. It makes the API highly susceptible to Brevo outages and causes massive latency spikes.
