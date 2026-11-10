# Documentation Hub

Welcome to the deep-dive documentation for the **authstack-server** project.

The main [README](../README.md) at the root of the repository covers how to run the project locally and lists the API endpoints. This folder is dedicated to explaining **how the system works under the hood** and **why specific architectural decisions were made**.

## 📁 Directory Index

### Architecture

- **[Architecture Overview](./architecture/overview.md)** — A high-level system diagram and data flow explanation.

### Architectural Decision Records (ADRs)

We use ADRs to document significant technical decisions, their context, and their trade-offs.

- **[ADR-001: Separating the API and Background Worker](./decisions/ADR-001-worker-separation.md)**
  _Why we run the Vercel API and the BullMQ Worker on separate hosting platforms._
- **[ADR-002: Async vs. Sync OTP Delivery](./decisions/ADR-002-sync-vs-async-otp.md)**
  _Why the initial OTP request is queued, but the resend OTP request is synchronous._
- **[ADR-003: Defense-in-Depth Rate Limiting](./decisions/ADR-003-defense-in-depth-rate-limiting.md)**
  _Why we use both Upstash (IP-based) and MongoDB (Email-based) rate limits._
- **[ADR-004: JWT Token Strategy & Session Management](./decisions/ADR-004-token-strategy.md)**
  _Why we use SHA-256 for refresh tokens but Bcrypt for OTPs, and how we handle Web vs. Mobile clients._

### Development Standards

- **[Commit Convention](./COMMIT_CONVENTION.md)** — The strict rules for formatting Git commit messages (enforced by Commitlint).
