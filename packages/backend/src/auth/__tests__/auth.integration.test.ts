/**
 * Integration tests: Full auth lifecycle using an in-memory SQLite DB.
 * Boots a real Fastify server with the full auth plugin wired up.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from '../auth.plugin.js';
import { hashPassword } from '../password.js';
import { createTestDb } from '../../db/test-helpers.js';
import { users } from '../../db/schema/users.js';
import { refreshTokens } from '../../db/schema/refresh-tokens.js';
import { authAuditLog } from '../../db/schema/auth-audit-log.js';
import type { AuthConfig } from '../config.js';
import { ulid } from 'ulid';

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

function makeConfig(): AuthConfig {
  return {
    keys: { v1: Buffer.from('a'.repeat(32)) },
    currentKid: 'v1',
    issuer: 'test',
    audienceAccess: 'test-api',
    audienceRefresh: 'test-refresh',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 86400,
    clockSkewSeconds: 30,
    loginRateMax: 5,
    loginRateWindowSeconds: 900,
  };
}

async function buildIntegrationServer() {
  const cfg = makeConfig();
  const db = createTestDb();
  const app = Fastify({ logger: false });

  // Expose authConfig for the auth route's rate-limit config lookup
  app.decorate('authConfig', cfg);

  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { db: db as any, config: cfg });

  // Seed a test user
  const passwordHash = await hashPassword('test-password');
  const userId = ulid();
  const now = new Date().toISOString();
  await db.insert(users).values({
    id: userId,
    email: 'test@example.com',
    passwordHash,
    roles: JSON.stringify(['user']),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  const adminId = ulid();
  const adminHash = await hashPassword('admin-password');
  await db.insert(users).values({
    id: adminId,
    email: 'admin@example.com',
    passwordHash: adminHash,
    roles: JSON.stringify(['user', 'admin']),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  // Register auth routes inline for integration test
  const { default: authRoutes } = await import('../../routes/auth.js');
  await app.register(authRoutes);

  // Protected route
  app.get('/api/projects', { preHandler: [app.authenticate] }, async () => ({
    projects: [],
  }));

  // Admin-only route
  app.get(
    '/api/admin',
    { preHandler: [app.authenticate, app.authorize(['admin'])] },
    async () => ({ ok: true }),
  );

  // SSE-like route
  app.get('/api/events', { preHandler: [app.authenticate] }, async () => ({
    connected: true,
  }));

  await app.ready();
  return { app, db, cfg, userId, adminId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Auth integration: login → access → refresh → reuse → logout', () => {
  let app: Awaited<ReturnType<typeof buildIntegrationServer>>['app'];
  let db: Awaited<ReturnType<typeof buildIntegrationServer>>['db'];

  beforeEach(async () => {
    const built = await buildIntegrationServer();
    app = built.app;
    db = built.db;
  });

  it('1. login returns 200 with access + refresh tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.tokenType).toBe('Bearer');
    expect(body.expiresIn).toBe(900);
  });

  it('2. authenticated GET /api/projects with access token returns 200', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('3. GET /api/projects without token returns 401 MISSING_TOKEN', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TOKEN');
  });

  it('4. GET /api/projects with invalid token returns 401 INVALID_ACCESS_TOKEN', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('5. refresh with current token returns 200 and old token is revoked', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    const { refreshToken: originalRefreshToken } = loginRes.json();

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: originalRefreshToken },
    });
    expect(refreshRes.statusCode).toBe(200);
    const { accessToken: newAccess, refreshToken: newRefresh } = refreshRes.json();
    expect(newAccess).toBeDefined();
    expect(newRefresh).toBeDefined();
    expect(newRefresh).not.toBe(originalRefreshToken);

    // Old token should be revoked in DB
    const rows = db.select().from(refreshTokens).all();
    const oldRow = rows.find((r: any) => r.replacedBy !== null);
    expect(oldRow?.revokedAt).toBeTruthy();
  });

  it('6. reuse detection: using old refresh token revokes all + returns 401', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    const { refreshToken: originalRefreshToken } = loginRes.json();

    // First refresh (legit)
    await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: originalRefreshToken },
    });

    // Second use of the original (already revoked) token → reuse detected
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: originalRefreshToken },
    });
    expect(reuseRes.statusCode).toBe(401);
    expect(reuseRes.json().error.code).toBe('INVALID_REFRESH_TOKEN');

    // All tokens for user should be revoked
    const rows = db.select().from(refreshTokens).all();
    const activeTokens = rows.filter((r: any) => r.revokedAt === null);
    expect(activeTokens).toHaveLength(0);

    // Audit log should contain refresh_reuse_detected
    const auditRows = db.select().from(authAuditLog).all();
    const reuseEvent = auditRows.find((r: any) => r.event === 'refresh_reuse_detected');
    expect(reuseEvent).toBeDefined();
  });

  it('7. logout returns 204 and subsequent refresh returns 401', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    const { accessToken, refreshToken } = loginRes.json();

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });
    expect(logoutRes.statusCode).toBe(204);

    // Refresh after logout should fail
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('8. admin route: non-admin user returns 403', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' }, // user role only
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('8b. admin route: admin user returns 200', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@example.com', password: 'admin-password' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('9. SSE: GET /api/events?accessToken=<jwt> connects successfully', async () => {
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    const { accessToken } = loginRes.json();

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?accessToken=${accessToken}`,
    });
    expect(res.statusCode).toBe(200);
  });

  it('9b. SSE: bad token on /api/events returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events?accessToken=bad-token',
    });
    expect(res.statusCode).toBe(401);
  });

  it('login: wrong password returns 401 INVALID_CREDENTIALS', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'test@example.com', password: 'wrong-password' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login: unknown email returns 401 INVALID_CREDENTIALS (no enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'any' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login: invalid body returns 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: 'pw' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_REQUEST');
  });

  it('refresh: invalid body returns 400 INVALID_REQUEST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_REQUEST');
  });

  it('logout: requires authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: 'some-token' },
    });
    expect(res.statusCode).toBe(401);
  });
});
