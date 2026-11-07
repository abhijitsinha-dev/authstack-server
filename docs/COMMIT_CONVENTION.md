# 📝 Git Commit Convention

This document defines the **commit message convention** used in the `authstack-server` project.
It ensures consistent, clear, and meaningful commits across the codebase.

We use **Commitlint** to enforce these rules automatically via a Husky `commit-msg` hook.

---

## 🧩 Commit Message Format

Each commit **must** follow this format:

```
type(scope): [emoji] message header

- body line 1
- body line 2

- footer line 1
- footer line 2
```

---

## 🧠 Formatting Rules

### Header

- **Lowercase letters** (uppercase allowed only for filenames that are uppercase, e.g., `App.tsx`, `README.md`)
- **No full stop at the end**
- **Maximum 50 characters**
- **Emoji recommended** (omitting an emoji triggers a warning, not an error)

### Body & Footer (optional)

- **Lowercase letters** (uppercase allowed only for filenames that are uppercase)
- **Each point on a new line**
- **No trailing punctuation (no full stops)**
- **Maximum 72 characters per line**

### General Rule

- **Use one space after a colon (`:`)** (missing space triggers a warning, not an error)

---

### ✅ Validation Rules

- ❌ **error** if type is invalid
- ❌ **error** if header exceeds 50 characters
- ❌ **error** if body/footer lines exceed 72 characters
- ❌ **error** if any line ends with a full stop (`.`)
- ⚠️ **warning** if scope is missing
- ⚠️ **warning** if no space after colon
- ⚠️ **warning** if emoji is missing from header

---

## 🔖 Types

| Commit Type | Title                    | Description                                                                                             | Emoji |
| ----------- | ------------------------ | ------------------------------------------------------------------------------------------------------- | :---: |
| `feat`      | Features                 | A new feature                                                                                           |  ✨   |
| `fix`       | Bug Fixes                | A bug fix                                                                                               |  🐛   |
| `docs`      | Documentation            | Documentation only changes                                                                              |  📚   |
| `style`     | Styles                   | Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.) |  💎   |
| `refactor`  | Code Refactoring         | A code change that neither fixes a bug nor adds a feature                                               |  📦   |
| `perf`      | Performance Improvements | A code change that improves performance                                                                 |  🚀   |
| `test`      | Tests                    | Adding missing tests or correcting existing tests                                                       |  🚨   |
| `build`     | Builds                   | Changes that affect the build system or external dependencies                                           |   🛠   |
| `ci`        | Continuous Integrations  | Changes to CI configuration files and scripts                                                           |  ⚙️   |
| `chore`     | Chores                   | Other changes that don't modify src or test files                                                       |  ♻️   |
| `revert`    | Reverts                  | Reverts a previous commit                                                                               |   🗑   |

---

## 🎯 Recommended Scopes (Backend)

> 💡 **Custom Scopes**: The scopes below are recommended defaults for common modules in this project. **Custom scopes are welcome too** whenever work applies to a specialized module or feature (e.g., `feat(swagger): ...`, `fix(security): ...`).

| Commit Scope | Description                                | Example                                          |
| :----------- | :----------------------------------------- | :----------------------------------------------- |
| `auth`       | Authentication logic, OTPs, Sessions       | `feat(auth): ✨ add resend otp cooldown`         |
| `api`        | API integrations, generic routes           | `refactor(api): 📦 update versioning structure`  |
| `db`         | MongoDB models, schemas, indexes           | `feat(db): ✨ add TTL index to OTP model`        |
| `worker`     | BullMQ workers, queue logic                | `perf(worker): 🚀 optimize drainDelay`           |
| `config`     | Environment variables, Swagger, ESLint     | `chore(config): ♻️ update swagger servers`       |
| `middleware` | Express middlewares (rate limit, validate) | `fix(middleware): 🐛 resolve rate limit headers` |
| `utils`      | Utility and helper functions               | `feat(utils): ✨ create jwt token generator`     |
| `deps`       | Package installations or upgrades          | `chore(deps): ♻️ upgrade bullmq to v6`           |

---

## 📝 Commit Message Examples

### Header Only

```
feat(auth): ✨ add jwt refresh token rotation
```

```
fix(worker): 🐛 resolve redis connection timeout
```

```
chore(deps): ♻️ upgrade bullmq to latest version
```

### Full Commit with Body

```
feat(worker): ✨ create reusable email processor

- add base processor with upstash rate limiter
- integrate brevo transactional email api
- include error handling for failed requests
```

### Full Commit with Header, Body, and Footer

```
feat(auth): ✨ implement multi device sessions

- create session document on user login
- store user agent and ip address
- generate hashed refresh tokens

- closes #42
- requires mongodb ttl index
```
