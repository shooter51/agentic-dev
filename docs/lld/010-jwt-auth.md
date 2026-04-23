# LLD-010: JWT Authentication Module

**Status:** Accepted (implementation pending)
**Date:** 2026-04-23
**Author:** Architect
**Pairs with:** ADR-0012
**Task:** 01KPX7X79H70V7MFTPQKQA62PK

---

## 1. Goals & Scope

Implement the auth architecture from ADR-0012:

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.
- Stateless `Authorization: Bearer` verification for all other API routes.
- Rotating refresh tokens with reuse detection stored in SQLite.
- Role-based authorisation (`user`, `admin`).
- argon2id password hashing with timing-safe unknown-user path.
- Rate-limited login endpoint.
- Multi-`kid` key ring for rotation.
- Seeded operator user from env.
- ≥ 80 % test coverage on the auth module.

Out of scope (explicit, per ADR-0012): signup flow, password reset, email verification, OAuth/SSO, MFA, access-token denylist, metrics framework wiring.

---

## 2. Directory Layout

```
packages/backend/src/auth/
  index.ts                      // Plugin export, public surface
  auth.plugin.ts                // Fastify plugin: decorators + error handler
  auth.service.ts               // login / refresh / logout business logic
  tokens.ts                     // issueAccess / issueRefresh / claim builders
  key-ring.ts                   // KeyRing: load, sign, verify, rotation
  password.ts                   // hashPassword / verifyPassword (+ dummy hash)
  rate-limit.ts                 // login-only @fastify/rate-limit config
  audit.ts                      // Structured audit emitter + DB writer
  errors.ts                     // AuthError subclasses → { code, httpStatus }
  principal.ts                  // AuthPrincipal type + request augmentation
  __tests__/
    auth.service.test.ts
    tokens.test.ts
    key-ring.test.ts
    password.test.ts
    rate-limit.test.ts
    auth.plugin.test.ts

packages/backend/src/auth/cli/
  hash-password.ts              // npm run auth:hash-password -- <pw>

packages/backend/src/db/schema/
  users.ts                      // NEW (drizzle)
  refresh-tokens.ts             // NEW
  auth-audit-log.ts             // NEW
packages/backend/src/db/schema/index.ts  // add exports

packages/backend/src/db/repositories/
  user.repository.ts            // NEW
  refresh-token.repository.ts   // NEW
  auth-audit.repository.ts      // NEW
packages/backend/src/db/repositories/index.ts  // add exports

packages/backend/src/db/migrations/
  0001_add_auth_tables.sql      // NEW (drizzle-kit generate)

packages/backend/src/db/seed.ts // extend: seedOperatorUser()

packages/backend/src/routes/
  auth.ts                       // NEW — POST /auth/{login,refresh,logout}
  index.ts                      // register auth.ts, add fastify.authenticate preHandler to existing protected routes

packages/backend/src/index.ts   // register auth plugin before routes; validate env

packages/shared/src/types/
  auth.ts                       // NEW — AuthPrincipal, LoginResponse, AuthErrorCode
packages/shared/src/types/index.ts  // export (currently barrel is `/src/index.ts`)
```

---

## 3. Types (`packages/shared/src/types/auth.ts`)

```ts
export type UserRole = 'user' | 'admin';

export interface AuthPrincipal {
  sub: string;           // user ULID
  roles: UserRole[];
  jti: string;           // access-token jti
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;     // seconds until access-token exp
  tokenType: 'Bearer';
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'INVALID_ACCESS_TOKEN'
  | 'MISSING_TOKEN'
  | 'INSUFFICIENT_ROLE'
  | 'RATE_LIMITED'
  | 'INVALID_REQUEST';

export interface AuthErrorBody {
  error: {
    code: AuthErrorCode;
    message: string;
    retryAfterSeconds?: number;
  };
}
```

Fastify request augmentation (in `packages/backend/src/auth/principal.ts`):

```ts
import 'fastify';
import type { AuthPrincipal } from '@agentic-dev/shared/types/auth';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthPrincipal;
  }
  interface FastifyInstance {
    auth: AuthService;
    authenticate: preHandlerHookHandler;
    authorize: (roles: UserRole[]) => preHandlerHookHandler;
  }
}
```

---

## 4. Drizzle Schemas

### `users.ts`

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),  // store lowercased; app-level normalisation
  passwordHash: text('password_hash').notNull(),
  roles: text('roles').notNull(),           // JSON array, parsed at repo boundary
  status: text('status', { enum: ['active', 'disabled'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
```

### `refresh-tokens.ts`

```ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    jti: text('jti').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    replacedBy: text('replaced_by'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    expIdx: index('refresh_tokens_exp_idx').on(t.expiresAt),
    replacedByIdx: index('refresh_tokens_replaced_idx').on(t.replacedBy),
  }),
);
```

### `auth-audit-log.ts`

```ts
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const authAuditLog = sqliteTable(
  'auth_audit_log',
  {
    id: text('id').primaryKey(),
    event: text('event', {
      enum: [
        'login_success',
        'login_failure',
        'refresh',
        'refresh_reuse_detected',
        'logout',
        'token_rejected',
      ],
    }).notNull(),
    userId: text('user_id'),
    emailHash: text('email_hash'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    details: text('details'),   // JSON
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    userCreatedIdx: index('auth_audit_user_created_idx').on(t.userId, t.createdAt),
    eventCreatedIdx: index('auth_audit_event_created_idx').on(t.event, t.createdAt),
  }),
);
```

Add exports to `packages/backend/src/db/schema/index.ts`.

---

## 5. KeyRing

```ts
// key-ring.ts (sketch)
export interface AuthConfig {
  keys: Record<string, Buffer>;     // kid → raw key bytes
  currentKid: string;
  issuer: string;
  audienceAccess: string;
  audienceRefresh: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  clockSkewSeconds: number;
  loginRateMax: number;
  loginRateWindowSeconds: number;
}

export class KeyRing {
  constructor(private readonly cfg: AuthConfig) {
    // Validate: currentKid in keys, every key >= 32 bytes.
  }
  sign(payload: object, opts: { aud: string; ttlSeconds: number }): string { … }
  verify(token: string, opts: { aud: string }): VerifyResult { … }
}

interface VerifyResult {
  payload: JwtPayload;
  kid: string;
}
```

Implementation uses `jsonwebtoken` (or `jose` — engineer's choice; both are solid, `jose` is smaller/modern and ESM-native which fits `"type": "module"`). **Recommendation: `jose`.**

Verify order: decode header → pick key by `kid` → verify signature → check `iss`, `aud`, `exp`, `nbf` with `clockSkewSeconds` tolerance → on `typ=refresh` expected, assert `payload.typ === 'refresh'`.

---

## 6. Password Module

```ts
// password.ts
import argon2 from 'argon2';

const ARGON2_OPTS = { type: argon2.argon2id, timeCost: 3, memoryCost: 65536, parallelism: 4 };

// Generated once at module load — stable across process lifetime.
const DUMMY_HASH = await argon2.hash('x'.repeat(32), ARGON2_OPTS);

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, ARGON2_OPTS);
}

export async function verifyPassword(
  pw: string,
  expectedHash: string | null,
): Promise<boolean> {
  // Always call argon2.verify — even if expectedHash is null — to keep timing constant.
  const hash = expectedHash ?? DUMMY_HASH;
  try {
    const ok = await argon2.verify(hash, pw);
    return ok && expectedHash !== null;
  } catch {
    return false;
  }
}
```

---

## 7. AuthService

```ts
// auth.service.ts (signatures only)
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuthAuditRepository,
    private readonly keyRing: KeyRing,
    private readonly cfg: AuthConfig,
    private readonly clock: () => Date,    // injectable for tests
  ) {}

  async login(input: { email: string; password: string; ip?: string; userAgent?: string }): Promise<LoginResponse>;
  async refresh(input: { refreshToken: string; ip?: string; userAgent?: string }): Promise<LoginResponse>;
  async logout(input: { refreshToken: string; actor: AuthPrincipal }): Promise<void>;

  /** Called by the authenticate preHandler. Pure (no DB reads). */
  verifyAccessToken(token: string): AuthPrincipal;
}
```

### login flow

1. Zod-validate body.
2. Lookup user by normalised email (`email.trim().toLowerCase()`).
3. `verifyPassword(pw, user?.passwordHash ?? null)` — timing-equal.
4. If `!ok || user.status !== 'active'` → audit `login_failure`, throw `AuthError.invalidCredentials()`.
5. Issue access + refresh tokens (new jti for refresh).
6. Insert refresh_tokens row (token_hash = sha256 of the signed JWT string).
7. Audit `login_success`.
8. Return `{ accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }`.

### refresh flow

See ADR-0012 §"Refresh-Token Rotation Algorithm".

Implementation notes:
- Reuse detection revokes the whole user's active refresh-token set — one `UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`.
- Transaction wraps the "insert new row + update old row" pair.

### logout flow

1. Require a valid access token (enforced by preHandler on the route).
2. Zod-validate body.
3. `UPDATE refresh_tokens SET revoked_at=now WHERE jti=? AND user_id=actor.sub AND revoked_at IS NULL` — ignore "not found" cases (idempotent).
4. Audit `logout`.
5. Return 204.

### verifyAccessToken

Wrapper around `keyRing.verify(token, { aud: AUDIENCE_ACCESS })` that maps payload → `AuthPrincipal`. Throws typed `AuthError` on failure.

---

## 8. Fastify Plugin

```ts
// auth.plugin.ts (sketch)
const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (fastify, opts) => {
  const service = new AuthService(...);

  fastify.decorate('auth', service);

  fastify.decorate('authenticate', async (req, reply) => {
    const header = req.headers.authorization;
    const token = extractBearer(header) ?? (req.url.startsWith('/api/events') ? extractEventSourceToken(req) : null);
    if (!token) return unauthorized(reply, 'MISSING_TOKEN');
    try {
      req.principal = service.verifyAccessToken(token);
    } catch (err) {
      return unauthorized(reply, mapAuthErrorCode(err));
    }
  });

  fastify.decorate('authorize', (roles: UserRole[]) => async (req, reply) => {
    if (!req.principal) return unauthorized(reply, 'MISSING_TOKEN');
    const ok = roles.some((r) => req.principal!.roles.includes(r));
    if (!ok) return reply.code(403).send({ error: { code: 'INSUFFICIENT_ROLE', message: 'Insufficient role' } });
  });

  // Redact password in request body logs
  fastify.log = fastify.log.child({}, { redact: ['req.body.password', 'req.body.refreshToken'] });
};
```

`extractEventSourceToken(req)` reads `accessToken` from query string for SSE. Strip it from log lines.

`unauthorized(reply, code)` sends `401` with the envelope.

---

## 9. Routes (`routes/auth.ts`)

```ts
export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const LoginBody = z.object({
    email: z.string().email().max(256),
    password: z.string().min(1).max(1024),
  });
  const RefreshBody = z.object({ refreshToken: z.string().min(1).max(4096) });
  const LogoutBody = z.object({ refreshToken: z.string().min(1).max(4096) });

  fastify.post('/auth/login', {
    config: { rateLimit: loginRateLimitConfig },  // @fastify/rate-limit per-route
  }, async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const res = await fastify.auth.login({
      email: body.email,
      password: body.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.code(200).send(res);
  });

  fastify.post('/auth/refresh', async (req, reply) => {
    const body = RefreshBody.parse(req.body);
    const res = await fastify.auth.refresh({
      refreshToken: body.refreshToken,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.code(200).send(res);
  });

  fastify.post('/auth/logout', {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const body = LogoutBody.parse(req.body);
    await fastify.auth.logout({ refreshToken: body.refreshToken, actor: req.principal! });
    return reply.code(204).send();
  });
}
```

---

## 10. Applying `authenticate` to Existing Routes

In each of `routes/{projects,tasks,agents,messages,memories,deliverables,stats,help}.ts`, register routes with `preHandler: [fastify.authenticate]`. The most compact pattern is to set it on the plugin scope:

```ts
export default async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);
  // … existing route definitions untouched
}
```

`routes/events.ts` (SSE) — same hook, but the handler reads the token from the `accessToken` query-param via the fallback branch in `authenticate`.

`routes/index.ts` must register `authRoutes` **first** (so `/auth/*` is reachable without auth), then the others. Because Fastify encapsulates hooks per plugin, `auth.ts` will not inherit the `addHook` from siblings.

### Public allowlist

Only the following routes bypass `authenticate`:
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /health` (new — engineering to add a trivial 200 responder)

Everything else requires a valid access token.

---

## 11. Rate Limit Config

Depends on `@fastify/rate-limit` (new dependency — pin latest v9.x compatible with Fastify v5).

```ts
// rate-limit.ts
export const loginRateLimitConfig = {
  max: Number(process.env.AUTH_LOGIN_RATE_MAX ?? 5),
  timeWindow: `${Number(process.env.AUTH_LOGIN_RATE_WINDOW_SECONDS ?? 900)} seconds`,
  keyGenerator: (req) => {
    const body = req.body as { email?: string } | undefined;
    const emailKey = body?.email ? sha256(body.email.toLowerCase()).slice(0, 16) : 'anon';
    return `${req.ip}:${emailKey}`;
  },
  errorResponseBuilder: (_req, ctx) => ({
    error: { code: 'RATE_LIMITED', message: 'Too many login attempts', retryAfterSeconds: Math.ceil(ctx.after / 1000) },
  }),
};
```

Register `@fastify/rate-limit` globally with `global: false` so only routes with `config.rateLimit` opt in.

---

## 12. Migration

`drizzle-kit generate` produces `0001_add_auth_tables.sql` with:
- `CREATE TABLE users`, `refresh_tokens`, `auth_audit_log`
- Indexes listed in ADR-0012.
- No data migration.

Run at boot via existing `migrate(db, { migrationsFolder })` call in `index.ts` — no change needed.

---

## 13. Seeding the Operator

Extend `db/seed.ts`:

```ts
export async function seedOperatorUser(db: DrizzleDB): Promise<void> {
  const email = requireEnv('OPERATOR_EMAIL').toLowerCase();
  const passwordHash = requireEnv('OPERATOR_PASSWORD_HASH');
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) return;
  await db.insert(users).values({
    id: ulid(),
    email,
    passwordHash,
    roles: JSON.stringify(['user', 'admin']),
    status: 'active',
    createdAt: now(),
    updatedAt: now(),
  });
}
```

Called in `index.ts` after `seedAgents` and after migrations. Fail-fast if env vars missing.

### Password-hash CLI helper

`packages/backend/src/auth/cli/hash-password.ts`:

```ts
#!/usr/bin/env tsx
import argon2 from 'argon2';
const pw = process.argv[2];
if (!pw) { console.error('Usage: tsx hash-password.ts <password>'); process.exit(1); }
console.log(await argon2.hash(pw, { type: argon2.argon2id, timeCost: 3, memoryCost: 65536, parallelism: 4 }));
```

Expose via `package.json` script:
```json
"auth:hash-password": "tsx src/auth/cli/hash-password.ts"
```

---

## 14. Config Loading & Validation

Add `packages/backend/src/auth/config.ts`:

```ts
export function loadAuthConfig(env = process.env): AuthConfig {
  const keysRaw = requireEnv('AUTH_JWT_KEYS', env);
  const keysObj = JSON.parse(keysRaw) as Record<string, string>;
  const keys: Record<string, Buffer> = {};
  for (const [kid, b64] of Object.entries(keysObj)) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 32) throw new Error(`AUTH_JWT_KEYS[${kid}] must be >= 256 bits`);
    keys[kid] = buf;
  }
  const currentKid = requireEnv('AUTH_CURRENT_KID', env);
  if (!keys[currentKid]) throw new Error('AUTH_CURRENT_KID not present in AUTH_JWT_KEYS');
  return {
    keys, currentKid,
    issuer: env.AUTH_ISSUER ?? 'agentic-dev',
    audienceAccess: env.AUTH_AUDIENCE_ACCESS ?? 'agentic-dev-api',
    audienceRefresh: env.AUTH_AUDIENCE_REFRESH ?? 'agentic-dev-refresh',
    accessTtlSeconds: Number(env.AUTH_ACCESS_TTL_SECONDS ?? 900),
    refreshTtlSeconds: Number(env.AUTH_REFRESH_TTL_SECONDS ?? 1209600),
    clockSkewSeconds: Number(env.AUTH_CLOCK_SKEW_SECONDS ?? 30),
    loginRateMax: Number(env.AUTH_LOGIN_RATE_MAX ?? 5),
    loginRateWindowSeconds: Number(env.AUTH_LOGIN_RATE_WINDOW_SECONDS ?? 900),
  };
}
```

Called once at boot; failure aborts startup.

---

## 15. Bootstrap Order (`packages/backend/src/index.ts`)

```
1. Load env (dotenv/config)
2. loadAuthConfig(process.env)          // fail-fast
3. Fastify({ logger: { redact: [...] } })
4. register @fastify/cors
5. migrate(db)
6. seedAgents(db)
7. seedOperatorUser(db)                  // NEW
8. Instantiate services (SSE, MessageBus, Pipeline, MemoryManager, Handoff, ToolExecutor)
9. server.decorate('pipeline' | 'memoryManager' | 'handoffService' | 'messageBus')
10. register @fastify/rate-limit { global: false }   // NEW
11. register authPlugin { db, config }                // NEW
12. register orchestratorPlugin
13. messageBus.recoverPendingMessages()
14. registerRoutes(server)   // authRoutes first inside this function
15. server.listen()
```

---

## 16. Testing Plan

### Unit (≥ 80 % coverage)

| File | What to test |
|---|---|
| `tokens.test.ts` | Access/refresh payload shape; `aud` differs; `jti` unique; `exp` respects TTL |
| `key-ring.test.ts` | Sign with current kid; verify with any kid; wrong-kid rejects; short-key fails load; tampered signature rejects; `iss`/`aud` mismatch rejects; clock-skew edge cases |
| `password.test.ts` | Correct pw verifies; wrong pw rejects; `null` expectedHash rejects with ~equal timing as wrong-pw (assert via histogram, not exact) |
| `auth.service.test.ts` | login happy path; login unknown-user returns same error; login disabled-user returns same error; refresh happy path rotates; refresh reuse revokes chain + user's refresh set; refresh expired rejects; refresh-with-access-token rejects (aud check); logout revokes; logout idempotent |
| `rate-limit.test.ts` | 5 attempts pass then 6th 429; window reset; key is (ip, email-hash); retryAfter populated |
| `auth.plugin.test.ts` | `authenticate` passes with valid, rejects expired/tampered/missing/wrong-aud; `authorize(['admin'])` gates by role; SSE query-param fallback works |

### Integration

`__tests__/auth.integration.test.ts` — boots Fastify (in-memory SQLite), runs:
1. login → 200 + tokens.
2. Authenticated GET `/api/projects` with access token → 200.
3. Same GET without token → 401 `MISSING_TOKEN`.
4. Same GET with expired token → 401 `INVALID_ACCESS_TOKEN`.
5. refresh with current refresh → 200, old refresh is revoked.
6. Using old refresh a 2nd time → 401, audit shows `refresh_reuse_detected`, all user refresh rows revoked.
7. logout → 204, next refresh → 401.
8. Admin-only route with non-admin → 403.
9. SSE `GET /api/events?accessToken=<jwt>` connects; bad token → 401.

### Security review checklist (to hand to security reviewer)

- [ ] Secrets only in env; `.env.example` has placeholders; `.env` gitignored.
- [ ] No hardcoded signing keys or dummy users.
- [ ] No plaintext password in logs (redaction verified).
- [ ] No full JWT in logs.
- [ ] argon2id params ≥ OWASP 2026 defaults.
- [ ] Timing-safe compare on token_hash.
- [ ] Rate-limit response includes `Retry-After`.
- [ ] Distinct `aud` enforced (token-confusion tests pass).
- [ ] Reuse detection tested and revokes chain + user set.
- [ ] Access-token lacks PII beyond `sub` + `roles`.
- [ ] HTTPS assumption documented.

---

## 17. OpenAPI

A follow-up: the repo does not currently expose OpenAPI/Swagger. Product's "Should" item "OpenAPI docs updated for all new endpoints" implies we need to stand this up. Engineering options:
- (a) Add `@fastify/swagger` + `@fastify/swagger-ui` as part of this PR, documenting just `/auth/*`. Light lift.
- (b) Write a standalone `docs/openapi/auth.yaml` and defer plugin wiring to a follow-up.

Recommendation: **(a)**, because the DoD checkbox requires it and doing (b) creates doc-vs-reality drift risk immediately.

---

## 18. Frontend Integration Notes (for downstream frontend work)

Not in this ticket's scope beyond hand-off, but:
- Store access token in memory (never localStorage).
- Store refresh token in memory; on page refresh, re-login is required unless we migrate to the cookie variant.
- API client intercepts 401 → calls `/auth/refresh` once → retries; if refresh fails → redirect to login.
- SSE reconnect must re-read the current access token each time (it may have been refreshed).

A separate frontend task should be raised; this is called out as an "out of scope" hand-back in the product doc (§4 Won't).

---

## 19. Follow-up Tickets to Raise After This PR

- OpenAPI infra wired across the whole API (if we only ship `/auth/*` docs in this PR).
- Metrics/counters for auth events.
- `auth_audit_log` retention cleanup cron.
- SIGHUP hot reload for key rotation.
- Frontend login UI + API client auth wiring.
- Optional: `httpOnly` cookie variant for refresh; access-token denylist; account lockout beyond rate limit; "active sessions" UI.
- If product later wants multi-user: signup / password-reset / email-verification / admin user-management UI.

---

## 20. Open Items — RESOLVED by PM (2026-04-23)

All four open items previously listed here were resolved at the product gate. Kept here for traceability.

| # | Question | Resolution | Source |
|---|---|---|---|
| 1 | Operator-seed approach accepted? | **ACCEPTED** — seed single operator from env (`OPERATOR_EMAIL` + `OPERATOR_PASSWORD_HASH`). No signup endpoint in this PR. | PM handoff §1 |
| 2 | SSE token-in-query-param acceptable? | **ACCEPTED** conditional on security-review sign-off. Access-token only (never refresh); redacted from logs. | PM handoff §1 |
| 3 | OpenAPI scope: (a) plugin + `/auth/*` only, or (b) YAML-only? | **(a)** — install `@fastify/swagger` + `@fastify/swagger-ui`, document `/auth/*` schemas only. Full API sweep is a follow-up. | PM handoff §1 |
| 4 | Library: `jose` vs `jsonwebtoken`? | **Engineer's call.** Recommendation in this LLD (§5) remains `jose`. Whichever is chosen must be documented in the PR description. | PM handoff §1 |

### Scope guards now locked (do NOT expand without re-scoping with PM)

- No signup / registration endpoints.
- No frontend changes.
- No OpenAPI for non-`/auth/*` routes.
- No metrics, retention cron, or key hot-reload (all "Could" follow-ups).

Engineering: proceed under this LLD + ADR-0012 as written. If anything in implementation materially changes product scope, `send_message` to `product-manager` before expanding.
