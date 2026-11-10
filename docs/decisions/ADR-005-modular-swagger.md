# ADR-005: Modular YAML API Documentation

## Status

**Accepted** (November 2026)

## Context

Initially, we used `swagger-jsdoc` to write OpenAPI specifications as massive JSDoc comment blocks directly above the Express route handlers.

As the application grew, `auth.route.js` became 99% documentation and 1% actual code. Developers had to scroll through hundreds of lines of JSDoc just to add a new middleware or change a controller.

## Decision

We will move the OpenAPI specification entirely out of the JavaScript route files and into dedicated **YAML files**.

We adopted a domain-driven folder structure (`docs/api/auth/`, `docs/api/system/`) and separated the schema definitions from the route paths. `swagger-jsdoc` is now configured to recursively read and merge all YAML files in the `docs/api/` directory at startup.

## Consequences

### Positive

- **Clean Code:** Express route files now contain purely routing logic, making them instantly readable.
- **No Merge Conflicts:** Multiple developers can work on different features (e.g., Auth vs. Users) in separate YAML files without conflicting in a giant single file.
- **Scalability:** Adding a new domain is as simple as creating a new folder with `paths`, `schemas`, and `responses` YAML files.
- **Language Agnostic:** The API contract is now decoupled from JavaScript.

### Negative

- **Context Switching:** Developers must switch between `.js` files and `.yaml` files when adding a new endpoint.
- **YAML Learning Curve:** Requires the team to be comfortable with YAML syntax and OpenAPI `$ref` references.
