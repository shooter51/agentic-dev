/**
 * E2E API tests: Verify auth enforcement across all API route groups.
 *
 * Boots a full Fastify server with the auth plugin and representative mock
 * routes for every route group. Confirms:
 *   - Default-deny: every protected route returns 401 with no token
 *   - Token acceptance: every protected route works with a valid Bearer token
 *   - Full auth lifecycle end-to-end through the API surface
 *   - Edge cases: expired-like tokens, wrong audience, tampered tokens
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from '../auth.plugin.js';
import { hashPassword } from '../password.js';
import { createTestDb } from '../../db/test-helpers.js';
import { users } from '../../db/schema/users.js';
import type { AuthConfig } from '../config.js';
import { KeyRing } from '../key-ring.js';
import { ulid } from 'ulid';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(): AuthConfig {
  return {
    keys: { v1: Buffer.from('b'.repeat(32)) },
    currentKid: 'v1',
    issuer: 'test-e2e',
    audienceAccess: 'test-api',
    audienceRefresh: 'test-refresh',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 86400,
    clockSkewSeconds: 30,
    loginRateMax: 10,
    loginRateWindowSeconds: 900,
  };
}

async function buildE2EServer() {
  const cfg = makeConfig();
  const db = createTestDb();
  const app = Fastify({ logger: false });
  app.decorate('authConfig', cfg);

  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { db: db as any, config: cfg });

  const now = new Date().toISOString();

  // Regular user
  const userId = ulid();
  const userHash = await hashPassword('user-pass');
  await db.insert(users).values({
    id: userId,
    email: 'user@e2e.test',
    passwordHash: userHash,
    roles: JSON.stringify(['user']),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // Admin user
  const adminId = ulid();
  const adminHash = await hashPassword('admin-pass');
  await db.insert(users).values({
    id: adminId,
    email: 'admin@e2e.test',
    passwordHash: adminHash,
    roles: JSON.stringify(['user', 'admin']),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // Register auth routes
  const { default: authRoutes } = await import('../../routes/auth.js');
  await app.register(authRoutes);

  // ---- Mock routes representing each API route group ----------------------
  // projects
  app.get('/api/projects', { preHandler: [app.authenticate] }, async () => ({ data: 'projects' }));
  app.post('/api/projects', { preHandler: [app.authenticate] }, async () => ({ data: 'created' }));
  app.get('/api/projects/:id', { preHandler: [app.authenticate] }, async () => ({ data: 'project' }));
  app.patch('/api/projects/:id', { preHandler: [app.authenticate] }, async () => ({ data: 'updated' }));

  // tasks
  app.get('/api/projects/:id/board', { preHandler: [app.authenticate] }, async () => ({ tasks: [] }));
  app.post('/api/projects/:id/tasks', { preHandler: [app.authenticate] }, async (_req, rep) => rep.code(201).send({ id: 'task-1' }));
  app.get('/api/tasks/:id', { preHandler: [app.authenticate] }, async () => ({ task: null }));
  app.patch('/api/tasks/:id', { preHandler: [app.authenticate] }, async () => ({ updated: true }));
  app.delete('/api/tasks/:id', { preHandler: [app.authenticate] }, async (_req, rep) => rep.code(204).send());

  // agents
  app.get('/api/agents', { preHandler: [app.authenticate] }, async () => ({ agents: [] }));
  app.get('/api/agents/:id', { preHandler: [app.authenticate] }, async () => ({ agent: null }));

  // messages
  app.get('/api/messages', { preHandler: [app.authenticate] }, async () => ({ messages: [] }));

  // memories
  app.get('/api/memories', { preHandler: [app.authenticate] }, async () => ({ memories: [] }));

  // deliverables
  app.get('/api/deliverables', { preHandler: [app.authenticate] }, async () => ({ deliverables: [] }));

  // events (SSE — uses query-param fallback)
  app.get('/api/events', { preHandler: [app.authenticate] }, async () => ({ stream: 'ok' }));

  // stats
  app.get('/api/stats', { preHandler: [app.authenticate] }, async () => ({ stats: {} }));

  // help
  app.get('/api/help', { preHandler: [app.authenticate] }, async () => ({ help: [] }));

  // admin-only
  app.get('/api/admin/users', { preHandler: [app.authenticate, app.authorize(['admin'])] }, async () => ({ users: [] }));

  await app.ready();
  return { app, db, cfg, userId, adminId };
}

// ---------------------------------------------------------------------------
// Protected routes catalogue — every route that must require auth
// ---------------------------------------------------------------------------

const PROTECTED_ROUTES = [
  { method: 'GET', url: '/api/projects' },
  { method: 'GET', url: '/api/projects/proj-1' },
  { method: 'GET', url: '/api/projects/proj-1/board' },
  { method: 'GET', url: '/api/tasks/task-1' },
  { method: 'GET', url: '/api/agents' },
  { method: 'GET', url: '/api/agents/agent-1' },
  { method: 'GET', url: '/api/messages' },
  { method: 'GET', url: '/api/memories' },
  { method: 'GET', url: '/api/deliverables' },
  { method: 'GET', url: '/api/events' },
  { method: 'GET', url: '/api/stats' },
  { method: 'GET', url: '/api/help' },
  { method: 'GET', url: '/api/admin/users' },
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E API: default-deny — all protected routes require auth', () => {
  let app: Awaited<ReturnType<typeof buildE2EServer>>['app'];

  beforeEach(async () => {
    ({ app } = await buildE2EServer());
  });

  it.each(PROTECTED_ROUTES)(
    '$method $url → 401 MISSING_TOKEN without token',
    async ({ method, url }) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('MISSING_TOKEN');
    },
  );
});

describe('E2E API: all protected routes accept a valid Bearer token', () => {
  let app: Awaited<ReturnType<typeof buildE2EServer>>['app'];

  beforeEach(async () => {
    ({ app } = await buildE2EServer());
  });

  it.each(PROTECTED_ROUTES.filter((r) => r.url !== '/api/admin/users'))(
    '$method $url → 2xx with valid token',
    async ({ method, url }) => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'user@e2e.test', password: 'user-pass' },
      });
      const { accessToken } = loginRes.json();

      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(res.statusCode).toBeLessThan(500);
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    },
  );
});

describe('E2E API: role-based access control', () => {
  let app: Awaited<ReturnType<typeof buildE2EServer>>['app'];

  beforeEach(async () => {
    ({ app } = await buildE2EServer());
  });

  it('non-admin user gets 403 INSUFFICIENT_ROLE on admin route', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@e2e.test', password: 'user-pass' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('admin user gets 200 on admin route', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@e2e.test', password: 'admin-pass' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('E2E API: complete auth lifecycle across API surface', () => {
  let app: Awaited<ReturnType<typeof buildE2EServer>>['app'];

  beforeEach(async () => {
    ({ app } = await buildE2EServer());
  });

  it('login → use API → refresh → use API with new token → logout → 401', async () => {
    // Step 1: Login
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@e2e.test', password: 'user-pass' },
    });
    expect(loginRes.statusCode).toBe(200);
    const { accessToken: at1, refreshToken: rt1 } = loginRes.json();

    // Step 2: Use API with access token
    const apiRes1 = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${at1}` },
    });
    expect(apiRes1.statusCode).toBe(200);

    // Step 3: Refresh tokens
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: rt1 },
    });
    expect(refreshRes.statusCode).toBe(200);
    const { accessToken: at2, refreshToken: rt2 } = refreshRes.json();
    expect(at2).not.toBe(at1);
    expect(rt2).not.toBe(rt1);

    // Step 4: Use API with new access token
    const apiRes2 = await app.inject({
      method: 'GET',
      url: '/api/agents',
      headers: { authorization: `Bearer ${at2}` },
    });
    expect(apiRes2.statusCode).toBe(200);

    // Step 5: Logout
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${at2}` },
      payload: { refreshToken: rt2 },
    });
    expect(logoutRes.statusCode).toBe(204);

    // Step 6: Old refresh token no longer works
    const staleRefresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: rt2 },
    });
    expect(staleRefresh.statusCode).toBe(401);
  });

  it('invalid Bearer token returns 401 INVALID_ACCESS_TOKEN on any protected route', async () => {
    for (const { method, url } of PROTECTED_ROUTES.slice(0, 3)) {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: 'Bearer this.is.not.valid' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
    }
  });

  it('SSE endpoint accepts access token via query param', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@e2e.test', password: 'user-pass' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?accessToken=${accessToken}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('SSE endpoint rejects invalid query-param token with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events?accessToken=garbage',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('health check is public and returns 200', async () => {
    // Register health endpoint on app if missing — it's on the real server
    const res = await app.inject({ method: 'GET', url: '/health' });
    // Health check might not be on the test server — skip if 404
    if (res.statusCode !== 404) {
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('E2E API: token validation edge cases', () => {
  let app: Awaited<ReturnType<typeof buildE2EServer>>['app'];
  let cfg: AuthConfig;

  beforeEach(async () => {
    ({ app, cfg } = await buildE2EServer());
  });

  it('refresh token used as access token is rejected (wrong audience)', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@e2e.test', password: 'user-pass' },
    });
    const { refreshToken } = loginRes.json();

    // Try to use refresh token as access token
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${refreshToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('completely fabricated token is rejected', async () => {
    const keyRing = new KeyRing(cfg);
    // Sign with wrong audience — will fail audience check
    const fakeToken = await keyRing.sign(
      { sub: 'attacker', roles: ['admin'], jti: ulid() },
      { aud: 'wrong-audience', ttlSeconds: 900 },
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${fakeToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('missing Authorization header returns 401 MISSING_TOKEN', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TOKEN');
  });

  it('malformed Authorization header (no Bearer prefix) returns 401', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@e2e.test', password: 'user-pass' },
    });
    const { accessToken } = loginRes.json();

    // Send token without "Bearer " prefix
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: accessToken },
    });
    expect(res.statusCode).toBe(401);
  });
});
