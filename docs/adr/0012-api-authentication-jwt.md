# ADR-0012: API Authentication — Stateless JWT with Rotating Refresh Tokens

**Status:** Accepted
**Date:** 2026-04-23
**Deciders:** Operator, Architect
**Supersedes:** — (no prior auth)
**Related:** ADR-0002 (Fastify), ADR-0004 (SQLite/Drizzle), ADR-0011 (Error Handling)
**Task:** 01KPX7X79H70V7MFTPQKQA62PK

---

## Context

The backend API (Fastify v5) is currently unauthenticated. It exposes task, agent, memory, messaging, and SSE endpoints to any caller on localhost. The product spec (see task handoff 01KPX7X79H70V7MFTPQKQA62PK) requires:

- Stateless authentication via JWT (`Authorization: Bearer <token>`).
- Login + refresh + logout endpoints.
- Bearer-token middleware on protected endpoints.
- Refresh-token rotation with reuse detection.
- Role-based authorisation (`user`, `admin`).
- Key rotation without invalidating live tokens.
- p95 auth-middleware overhead < 5 ms.
- ≥ 80 % unit-test coverage on the auth module.

### Scope note — users do not yet exist

This ADR explicitly flags two scope realities the product handoff did not fully anticipate:

1. **No existing auth to migrate from.** Resolves open question 5 — no migration plan is required.
2. **No `users` table exists** in the schema (ADR-0004). The PRD §10 lists "Multi-user support (single operator)" as a non-goal. Product section 5 marks user registration as "out of scope — assumed to already exist." It does **not** exist. This ADR reconciles the two by defining a **single seeded operator user** (via env vars) as the MVP user set, with a `users` table schema that can grow if multi-user is ever added. Engineering must confirm this interpretation with product before ambiguity becomes rework; if product wants a full signup flow added here, scope expands and re-planning is required.

---

## Decision

Introduce a self-contained `auth` module in `packages/backend/src/auth/`, exposed as a Fastify plugin, with the following decisions on each open question from the product handoff.

### 1. Algorithm — **HS256** for MVP

Symmetric HMAC-SHA256. The API is both issuer and verifier; there are no third-party verifiers yet. HS256 removes the operational overhead of key-pair management and a JWKS endpoint. RS256 + JWKS is listed as a "Could" in product scope and can be added as a non-breaking follow-up by introducing new `kid`s with `alg=RS256` alongside the HS256 keys (the verifier already dispatches by `kid`).

**Signing-key entropy:** ≥ 256 bits, base64-encoded, stored only in env / secret manager.

### 2. Token TTLs — **15 minutes access, 14 days refresh** (configurable)

Matches product proposal. No compliance constraint applies (local single-operator system).

- `AUTH_ACCESS_TTL_SECONDS` default `900`.
- `AUTH_REFRESH_TTL_SECONDS` default `1209600` (14 d).
- **Clock skew tolerance: ±30 s** (resolves open question 7). Configurable via `AUTH_CLOCK_SKEW_SECONDS` (default `30`).

### 3. Refresh-token storage — **SQLite (`refresh_tokens` table)**

Consistent with ADR-0004 ("zero config, no server"). Redis would reintroduce operational overhead explicitly rejected there. SQLite single-writer concurrency is a non-issue on the auth path: refresh is O(1) indexed lookup + one `UPDATE` on rotation.

**Revocation latency:** immediate (next refresh attempt reads the revoked row).

### 4. Access-token denylist — **No, for MVP**

Short TTL (15 min) + refresh-token revocation is sufficient. A compromised access token self-expires quickly; the attacker cannot refresh because the refresh row is revoked. The JWT `jti` claim is still included on access tokens so a denylist can be added later as a non-breaking change (a new table + an optional check in the verify middleware).

### 5. Existing auth — **None exists** (see scope note above)

No migration needed. Add a `users` table. Seed one row at boot from `OPERATOR_EMAIL` + `OPERATOR_PASSWORD_HASH` env vars, roles `["user","admin"]`. Engineering must fail-fast at boot if these env vars are unset.

### 6. Token transport (browser) — **`Authorization: Bearer` header on request, JSON body for refresh**

Acceptance criteria US-2 already mandates `Authorization: Bearer`. For the refresh flow, the client sends the refresh token in the JSON body of `POST /auth/refresh` (not as a cookie). Rationale:

- Keeps the API uniform across browser, mobile, and server-to-server clients.
- Avoids mixed CSRF-vs-XSS reasoning during MVP.
- Frontend stores access token in memory only (never `localStorage`); refresh token held in-memory by the SPA and re-issued via refresh rotation. A secure `httpOnly` cookie variant for refresh can be added later without an API-contract change (the server would accept both: cookie first, body fallback).

### 7. Clock skew tolerance — **±30 seconds** (confirmed above)

### 8. Rate-limit backend — **In-memory** (`@fastify/rate-limit` default store)

Matches local-first stance in PRD §9 and ADR-0004. The system runs single-instance. Redis store is unnecessary and would drag in a dependency that ADR-0004 explicitly avoided. If the system is ever deployed multi-instance, swap the store in config; no API change.

**Policy:** `POST /auth/login` limited to `5 attempts / 15 min` keyed by `(ip, sha256(email))`. Failures increment the counter regardless of whether the user exists (prevents enumeration). Returns HTTP 429 with `Retry-After`.

---

## Module Shape (summary — detail in LLD-010)

```
packages/backend/src/auth/
  index.ts                 // Fastify plugin export
  auth.plugin.ts           // Registers decorators: authenticate, authorize, auth
  auth.service.ts          // Business logic: login, refresh, logout, verify
  key-ring.ts              // Multi-kid key loader + rotation-aware signer/verifier
  password.ts              // argon2id hash + verify (with dummy-hash timing-safe miss)
  tokens.ts                // Access / refresh token issuance + claim construction
  rate-limit.ts            // Login rate-limit composite-key + config
  audit.ts                 // Structured audit log writer
  errors.ts                // Typed auth errors → machine-readable error codes
  __tests__/               // colocated vitest specs
packages/backend/src/db/schema/
  users.ts                 // NEW
  refresh-tokens.ts        // NEW
  auth-audit-log.ts        // NEW
packages/backend/src/db/repositories/
  user.repository.ts       // NEW
  refresh-token.repository.ts // NEW
  auth-audit.repository.ts // NEW
packages/backend/src/routes/
  auth.ts                  // NEW — POST /auth/login | /auth/refresh | /auth/logout
packages/shared/src/types/
  auth.ts                  // NEW — AuthPrincipal, LoginResponse, error codes
```

### Layered-architecture conformance

Route → Service → Repository → Schema. No cross-layer skips. JWT verification lives in the plugin layer (Fastify preHandler), not in repositories. No business logic in routes.

### Fastify decorators

- `fastify.authenticate` — preHandler that verifies the bearer token, sets `request.principal: { sub, roles, jti }`, returns 401 on any failure.
- `fastify.authorize(roles: string[])` — preHandler factory; returns 403 if the principal lacks any required role. Runs **after** `authenticate`.
- `fastify.auth` — `AuthService` instance for route handlers that need to call `login/refresh/logout` directly.

### Applying auth to existing routes

**Default-deny** at the route-plugin level. During this PR, engineering must add `preHandler: [fastify.authenticate]` to every existing protected route in `routes/*.ts`. A single `PUBLIC_ROUTES` allowlist constant is the only opt-out: `/auth/login`, `/auth/refresh`, `/health` (new), and the SSE events endpoint (TBD — see open follow-up below). The SSE endpoint requires a token-in-query-param fallback because `EventSource` cannot set headers; engineering should implement `?accessToken=<jwt>` specifically for SSE, log the full URL with the token redacted, and document the trade-off.

---

## API Contracts

### `POST /auth/login`

Request:
```json
{ "email": "operator@example.com", "password": "…" }
```

Response `200`:
```json
{
  "accessToken": "eyJ…",
  "refreshToken": "eyJ…",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

Failures:
- `401 { "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }` — identical response for unknown email, wrong password, or disabled user (no enumeration).
- `429 { "error": { "code": "RATE_LIMITED", "retryAfterSeconds": 840 } }`.
- `400 { "error": { "code": "INVALID_REQUEST", "message": "…" } }` — schema validation (zod).

### `POST /auth/refresh`

Request:
```json
{ "refreshToken": "eyJ…" }
```

Response `200` — same shape as login (access + new rotated refresh).

Failures:
- `401 { "error": { "code": "INVALID_REFRESH_TOKEN" } }` — expired, revoked, unknown, signature bad, or reuse detected.
- On **reuse detection**: server revokes the entire refresh-token chain for the affected user and emits an audit event `refresh_reuse_detected`.

### `POST /auth/logout`

Auth: `Authorization: Bearer <access>` required.
Request:
```json
{ "refreshToken": "eyJ…" }
```

Response `204 No Content`.

Failures:
- `401` if access token invalid.
- Returns `204` even if the refresh token is already revoked/unknown (idempotent; no info leak).

### Error envelope (all failure responses)

```json
{ "error": { "code": "MACHINE_READABLE_CODE", "message": "human-readable" } }
```

Error codes enumerated in `packages/shared/src/types/auth.ts` so the frontend can branch on them.

---

## JWT Claims

### Access token

```
header:  { "alg": "HS256", "typ": "JWT", "kid": "<current-kid>" }
payload: {
  "sub":   "<user_ulid>",
  "iat":   <unix>,
  "exp":   <iat + AUTH_ACCESS_TTL_SECONDS>,
  "iss":   "agentic-dev",
  "aud":   "agentic-dev-api",
  "roles": ["user","admin"],
  "jti":   "<ulid>"
}
```

### Refresh token

```
header:  { "alg": "HS256", "typ": "JWT", "kid": "<current-kid>" }
payload: {
  "sub":   "<user_ulid>",
  "iat":   <unix>,
  "exp":   <iat + AUTH_REFRESH_TTL_SECONDS>,
  "iss":   "agentic-dev",
  "aud":   "agentic-dev-refresh",
  "jti":   "<ulid>",            // matches refresh_tokens.jti
  "typ":   "refresh"
}
```

**Distinct `aud` per token type** is intentional: the access-token middleware rejects anything with `aud != "agentic-dev-api"`, and the refresh endpoint rejects anything with `aud != "agentic-dev-refresh"`. This prevents token-confusion attacks where a refresh token is replayed as an access token or vice versa.

---

## Data Model Additions

```
users
  id             TEXT PRIMARY KEY  (ULID)
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE
  password_hash  TEXT NOT NULL          -- argon2id (full encoded string incl. salt+params)
  roles          TEXT NOT NULL          -- JSON array, e.g. ["user","admin"]
  status         TEXT NOT NULL          -- active | disabled
  created_at     TEXT NOT NULL
  updated_at     TEXT NOT NULL

refresh_tokens
  jti            TEXT PRIMARY KEY       -- ULID; matches JWT jti claim
  user_id        TEXT NOT NULL FK(users ON DELETE CASCADE)
  token_hash     TEXT NOT NULL          -- SHA-256(refresh JWT); DB leak ≠ token leak
  expires_at     TEXT NOT NULL
  revoked_at     TEXT                   -- NULL when active
  replaced_by    TEXT                   -- jti of rotation successor (for reuse detection)
  ip             TEXT
  user_agent     TEXT
  created_at     TEXT NOT NULL

auth_audit_log
  id             TEXT PRIMARY KEY  (ULID)
  event          TEXT NOT NULL          -- login_success | login_failure | refresh |
                                        -- refresh_reuse_detected | logout | token_rejected
  user_id        TEXT                   -- NULL when login fails for unknown email
  email_hash     TEXT                   -- SHA-256(lowercased email); privacy-preserving
  ip             TEXT
  user_agent     TEXT
  details        TEXT                   -- JSON: {error_code, jti, ...}
  created_at     TEXT NOT NULL
```

### Indexes

- `users(email)` — unique (implicit on UNIQUE).
- `refresh_tokens(user_id)` — revoke-all-for-user, cleanup.
- `refresh_tokens(expires_at)` — cleanup job.
- `refresh_tokens(replaced_by)` — reuse-detection graph walks.
- `auth_audit_log(user_id, created_at)` — per-user audit retrieval.
- `auth_audit_log(event, created_at)` — metric/alert queries.

### Migration

Single migration adding the three tables. No data migration (no prior auth state).

---

## Refresh-Token Rotation Algorithm (reuse detection)

Given refresh JWT `X` with payload `jti=A, sub=U`:

1. Verify signature, `iss`, `aud=agentic-dev-refresh`, `typ=refresh`, `exp` (with ±30 s skew).
2. Compute `h = sha256(X)`.
3. `row := refresh_tokens.findById(A)`.
4. If `row === null` → audit `token_rejected`, return 401.
5. If `row.revoked_at !== null` → **reuse**: revoke the entire chain starting at the ancestor of `A` (walk `replaced_by` graph), revoke all active refresh tokens for user `U`, audit `refresh_reuse_detected`, return 401.
6. If `row.token_hash !== h` (constant-time compare) → audit `token_rejected`, return 401.
7. If `row.expires_at < now` → audit `token_rejected`, return 401.
8. If `users.status !== 'active'` → 401.
9. Begin transaction:
   - Insert new refresh row with `jti=B, user_id=U, token_hash=sha256(newJwt), …`.
   - Update old row: `revoked_at=now, replaced_by=B`.
10. Issue new access + refresh; return to client.
11. Audit `refresh`.

This is the OAuth 2 Security BCP's recommended rotation-with-reuse-detection pattern.

---

## Password Hashing

- **Algorithm:** argon2id (npm `argon2`, native binding via libargon2).
- **Parameters (OWASP 2026 defaults):** `t=3, m=65536 (64 MiB), p=4`.
- **Timing safety on miss:** When `email` maps to no user, still perform an `argon2.verify` against a **stable dummy hash** stored in module memory so the unknown-user code path has identical latency to the wrong-password path. This prevents user-enumeration via timing.
- Passwords are never logged. `LoginRequest` fields are redacted in the Fastify logger via a serializer override.

---

## Key Rotation (US-6)

- Config env var `AUTH_JWT_KEYS` holds a JSON object `{ "v1": "<base64-secret>", "v2": "<base64-secret>" }`.
- `AUTH_CURRENT_KID` selects which key is used for **signing** new tokens.
- The `KeyRing` verifies each token using the key whose kid matches the token header. All keys in `AUTH_JWT_KEYS` are active verifiers.
- **Rotation procedure** (to be documented in `docs/runbooks/auth-key-rotation.md` by engineering):
  1. Generate new 256-bit secret; add as `v{N+1}` to `AUTH_JWT_KEYS`.
  2. Restart backend so the new key is loaded and verified.
  3. Set `AUTH_CURRENT_KID=v{N+1}`; restart. New tokens sign with the new key.
  4. Wait `AUTH_REFRESH_TTL_SECONDS` + skew (14 d + 30 s) so all old-kid tokens have expired.
  5. Remove old key from `AUTH_JWT_KEYS`; restart.

**Hot reload** (SIGHUP or config watcher) is a "Could" follow-up. MVP uses restart-triggered reload.

---

## Configuration (env vars)

| Var | Required | Default | Notes |
|---|---|---|---|
| `AUTH_JWT_KEYS` | yes | — | JSON `{kid: base64-secret}`. Boot fails if unset or any secret < 32 bytes. |
| `AUTH_CURRENT_KID` | yes | — | Must be present in `AUTH_JWT_KEYS`. |
| `AUTH_ISSUER` | no | `agentic-dev` | |
| `AUTH_AUDIENCE_ACCESS` | no | `agentic-dev-api` | |
| `AUTH_AUDIENCE_REFRESH` | no | `agentic-dev-refresh` | |
| `AUTH_ACCESS_TTL_SECONDS` | no | `900` | |
| `AUTH_REFRESH_TTL_SECONDS` | no | `1209600` | |
| `AUTH_CLOCK_SKEW_SECONDS` | no | `30` | |
| `AUTH_LOGIN_RATE_MAX` | no | `5` | |
| `AUTH_LOGIN_RATE_WINDOW_SECONDS` | no | `900` | |
| `OPERATOR_EMAIL` | yes | — | Seeded at boot if no user row exists. |
| `OPERATOR_PASSWORD_HASH` | yes | — | Pre-computed argon2id hash. A one-off CLI helper (`npm run auth:hash-password`) generates this. |

`.env.example` must be updated with placeholder values for all of the above. Real secrets live only in `.env` (gitignored).

---

## Observability

- **Structured logs:** one JSON log line per auth event (INFO on success, WARN on failure). Fields: `event, user_id, email_hash, ip, user_agent, jti, error_code`. No plaintext password ever.
- **Audit table:** `auth_audit_log` mirrors log events for queryable history. Retention policy: 90 days, cleanup cron (to be scheduled — follow-up ticket).
- **Metrics (follow-up):** counters for `auth.login.success`, `auth.login.failure`, `auth.refresh.success`, `auth.refresh.reuse`, `auth.token.rejected`. No metrics framework is wired up yet in the backend; defer to a later ADR.

---

## Performance

- Target: p95 middleware overhead < 5 ms.
- HS256 verify is ~50 µs; argon2 is only on the login path (deliberately slow, ~50 ms — acceptable because login is not hot).
- Middleware does **zero DB reads** (stateless access-token verification). Only refresh hits the DB (one indexed read + one write on rotation).

---

## Security Hardening Decisions

| Concern | Decision |
|---|---|
| Signing-key entropy | ≥ 256 bits, enforced at boot |
| Secrets in repo | Banned — only in env / secret manager; `.env` is gitignored; security review checks `.env.example` has no real values |
| Password hashing | argon2id `t=3, m=64MiB, p=4`; dummy-hash timing equalization on unknown-user |
| User enumeration | Identical error code + latency for unknown-user / wrong-password / disabled-user |
| Rate limiting | 5 / 15 min / (ip + email-hash) on `/auth/login`; returns 429 + `Retry-After` |
| Token confusion | Distinct `aud` for access vs refresh; `typ=refresh` asserted on refresh |
| Reuse detection | Chain-walk revocation + user-wide refresh revocation on detection |
| DB-leak impact | Only `sha256(refresh_jwt)` stored, not the JWT itself |
| Logging PII | Email logged as sha256 hash; never log passwords, never log full JWTs |
| Transport | HTTPS assumed at the deployment layer (out of auth module's scope) |
| Clock skew | ±30 s on `exp`/`nbf` |
| Scope expansion | Default-deny via `authenticate` preHandler on every route; explicit public allowlist |

---

## Alternatives Considered

1. **Redis-backed refresh-token store** — Rejected: contradicts ADR-0004's local-first no-external-services stance. SQLite is plenty fast on the refresh path.
2. **RS256 from day one** — Rejected: no third-party verifiers exist. Key-pair mgmt + JWKS endpoint is unnecessary complexity. Upgrade path is non-breaking via `kid`.
3. **`httpOnly` cookie for both tokens** — Rejected for MVP: would require full CSRF machinery (double-submit cookies or SameSite=Strict plus origin checks) before any endpoint is callable. Bearer header is simpler and matches the product acceptance criteria as written. Can be layered on later.
4. **Per-route role decorators via metadata (NestJS-style)** — Rejected: too much magic for Fastify's explicit plugin model. `preHandler: [fastify.authenticate, fastify.authorize(['admin'])]` is explicit and greppable.
5. **Combined access-token denylist from day one** — Rejected: doubles the DB read on every authenticated request without meaningful risk reduction given the 15 min TTL. Can be added non-breakingly later.
6. **Full signup flow in this PR** — Rejected: out of product scope §5. Single seeded operator is the MVP. Re-open if multi-user becomes a goal.

---

## Consequences

**Positive**
- Stateless verification scales horizontally with zero shared state (per goal §1).
- Short-TTL access + rotating refresh is the industry standard for a reason: limits blast radius of leaks.
- Single module boundary (`src/auth/`) keeps the audit surface small for security review.
- Layered architecture conformance keeps the pattern consistent with the rest of the backend.

**Negative**
- Every existing route must have `preHandler: [fastify.authenticate]` added in this PR. Non-trivial diff footprint (~9 route files). Mitigated by route-plugin-level registration.
- SSE requires `?accessToken=<jwt>` query-param because `EventSource` can't set headers. Introduces a token-in-URL leak risk (logs, Referer). Mitigated by log-redaction + short access-token TTL; document the trade-off.
- argon2 native binding increases install size and may need rebuilds across Node versions. Acceptable.
- Env-seeded operator is a minor operational step. Offset by a small CLI helper to hash the password.

**Risks**
- Clock drift > 30 s on the operator's machine would cause login failures. Operator-facing symptom is clear ("token not yet valid"); document in troubleshooting.
- If product later wants multi-user / signup, this ADR must be revised. Schema is forward-compatible; the risk is behavioural (password-reset, email verification, rate-limit policy per user, etc.). Flag in any follow-up PRD.

---

## Definition of Done (architecture)

- [x] All 8 open questions from product handoff resolved with rationale.
- [x] Scope tension (no users, no signup) flagged and resolved via seeded-operator approach.
- [x] Layered architecture boundaries specified.
- [x] Data model + indexes + migration specified.
- [x] API contracts (requests / responses / error codes) specified.
- [x] JWT claim schemas and key-rotation approach specified.
- [x] Security hardening decisions enumerated for security review.
- [x] Handoff to engineering with actionable task list.
- [x] **Arch-review gate (2026-04-23):** PM resolved the four architect-raised items (operator-seed accepted, SSE query-param accepted pending sec-review, OpenAPI scope = plugin + `/auth/*` only, lib choice = engineer's call). No architectural changes required. See LLD-010 §20 for the resolution table.
