# Contributing to authstack-server

First off, thank you for considering contributing to `authstack-server`! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

---

## 📑 Table of Contents

1. [Code of Conduct](#1-code-of-conduct)
2. [Reporting Bugs & Suggesting Features](#2-reporting-bugs--suggesting-features)
3. [Development Setup](#3-development-setup)
4. [Branch Naming](#4-branch-naming)
5. [Commit Guidelines](#5-commit-guidelines)
6. [Testing & Quality Checks](#6-testing--quality-checks)
7. [Submitting a Pull Request](#7-submitting-a-pull-request)
8. [Architecture Guidelines](#8-architecture-guidelines)

---

## 1. 📜 Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please be respectful and constructive in all interactions. We expect all contributors to foster an open, welcoming, and harassment-free environment.

---

## 2. 🐛 Reporting Bugs & Suggesting Features

Before creating a new issue, please search the existing issues to see if someone has already reported it.

### Reporting a Bug

If you find a bug, please open an issue and include:

- A clear, descriptive title.
- Steps to reproduce the behavior.
- Expected vs. actual behavior.
- Any relevant logs or error messages (ensure you redact sensitive data like API keys).

### Suggesting a Feature

We welcome new ideas! Please open an issue and include:

- A clear, descriptive title.
- The motivation for the feature (what problem does it solve?).
- A basic example of how it would work.

---

## 3. 🚀 Development Setup

### Prerequisites

We use **Node.js 26 (LTS)**. If you use `nvm` or `fnm`, you can easily switch to the correct version:

```bash
nvm use # or fnm use
```

### Installation

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/authstack-server.git
   cd authstack-server
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
   > **Note:** This will automatically run `husky` and set up the Git hooks via the `prepare` script.

### Environment Variables

Before you start coding, you must set up your environment variables:

```bash
cp .env.example .env
# Edit .env with your local MongoDB, Redis, and Brevo credentials
```

### Running Locally

Because of our decoupled architecture, you will need to run **two** processes in separate terminals during development:

- **Terminal 1 (API):** `npm run dev`
- **Terminal 2 (Worker):** `npm run worker`

---

## 4. 🌿 Branch Naming

Please create a new branch for your feature or bug fix. Use a descriptive name with one of the following prefixes:

- `feat/your-feature-name` (for new features)
- `fix/bug-description` (for bug fixes)
- `docs/update-readme` (for documentation)
- `refactor/component-name` (for code refactoring)
- `chore/dependency-update` (for maintenance)

---

## 5. 📝 Commit Guidelines

We strictly follow a specific commit message format to keep our Git history clean and allow for automated changelog generation. Our Git hooks will automatically block your commit if it doesn't follow the rules.

> 👉 **Please read our [Commit Convention](./docs/COMMIT_CONVENTION.md) before making your first commit.**

---

## 6. 🧪 Testing & Quality Checks

We have a robust CI/CD-like pipeline built into our local Git hooks (Husky). You don't need to remember to run these manually, but you can:

- **Before every commit:** `lint-staged` runs automatically to fix formatting (Prettier) and catch code errors (ESLint) on the files you changed.
- **Before every push:** The entire Jest test suite runs automatically to ensure you haven't broken anything.

### Testing Philosophy

Our test suite includes both **Unit Tests** (using mocks for external services like MongoDB, Redis, and Brevo) and **Integration Tests** (using `supertest`). If you are adding a new feature, you must include tests for it.

### Manual Commands

```bash
# Run the test suite with coverage
npm test

# Run ESLint
npm run lint

# Check formatting without writing
npm run format:check
```

---

## 7. 📬 Submitting a Pull Request

1. Push your branch to your fork: `git push origin feat/your-feature-name`
2. Open a Pull Request against the `main` branch of the original repository.
3. Provide a clear, descriptive title and explain the changes you made.
4. Reference any relevant issues (e.g., `closes #42`).

### PR Checklist (Please review before submitting)

- [ ] I have read the [Commit Convention](./docs/COMMIT_CONVENTION.md).
- [ ] My code follows the existing code style and architecture.
- [ ] I have added tests that prove my fix is effective or that my feature works.
- [ ] All new and existing tests pass locally (`npm test`).
- [ ] I have updated the documentation accordingly (if applicable).

---

## 8. 🏗️ Architecture Guidelines

If your contribution involves architectural changes (e.g., adding a new background process, changing the queue system, or modifying the rate limiter), please review our **[Architecture Decision Records (ADRs)](./docs/README.md)** first.

If you are introducing a significant new architectural pattern, we may ask you to include a new ADR in your Pull Request!
