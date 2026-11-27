# Documentation Hub

Welcome to the deep-dive documentation for the **authstack-server** project.

The main [README](../README.md) at the root of the repository covers how to run the project locally and lists the API endpoints. This folder is dedicated to explaining **how the system works under the hood** and **why specific architectural decisions were made**.

## 📁 Directory Index

### Architecture

- **[Architecture Overview](./architecture/overview.md)** — A high-level system diagram and data flow explanation.

### Architectural Decision Records (ADRs)

We use ADRs to document significant technical decisions, their context, and their trade-offs.

- **[ADR-001: Separating the API and Background Worker](./decisions/ADR-001-worker-separation.md)**
- **[ADR-002: Async vs. Sync OTP Delivery](./decisions/ADR-002-sync-vs-async-otp.md)**
- **[ADR-003: Defense-in-Depth Rate Limiting](./decisions/ADR-003-defense-in-depth-rate-limiting.md)**
- **[ADR-004: JWT Token Strategy & Session Management](./decisions/ADR-004-token-strategy.md)**
- **[ADR-005: Modular YAML API Documentation](./decisions/ADR-005-modular-swagger.md)** _(New)_

### API Specifications

We use a domain-driven OpenAPI 3.0 YAML structure to document our API.

- **[API Directory](./api/)** — The root folder for all OpenAPI YAML files.
- **[Auth Routes](./api/auth/auth.paths.yaml)** — Authentication endpoints.
- **[System Routes](./api/system/system.paths.yaml)** — Health and root probes.

### Development Standards

- **[Commit Convention](./COMMIT_CONVENTION.md)** — The strict rules for formatting Git commit messages (enforced by Commitlint).
