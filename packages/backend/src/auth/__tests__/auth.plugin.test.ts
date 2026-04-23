import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from '../auth.plugin.js';
import { createTestDb } from '../../db/test-helpers.js';
import { KeyRing } from '../key-ring.js';
import { issueAccessToken, issueRefreshToken } from '../tokens.js';
import { hashPassword } from '../password.js';
import type { AuthConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Shared setup
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

async function buildServer() {
  const cfg = makeConfig();
  const db = createTestDb();
  const app = Fastify({ logger: false });

  await app.register(rateLimit, { global: false });
  await app.register(authPlugin, { db: db as any, config: cfg });

  // A protected route
  app.get('/protected', { preHandler: [app.authenticate] }, async (req) => {
    return { sub: (req as any).principal?.sub };
  });

  // An admin-only route
  app.get(
    '/admin',
    { preHandler: [app.authenticate, app.authorize(['admin'])] },
    async (req) => {
      return { ok: true };
    },
  );

  // Mimic SSE path to test query-param fallback
  app.get(
    '/api/events',
    { preHandler: [app.authenticate] },
    async (req) => {
      return { sub: (req as any).principal?.sub };
    },
  );

  await app.ready();
  return { app, cfg, db };
}

// Issue a real access token for tests
async function makeAccessToken(
  cfg: AuthConfig,
  opts: { roles?: string[]; ttl?: number } = {},
) {
  const kr = new KeyRing(cfg);
  const { token } = await issueAccessToken(kr, cfg as any, {
    id: 'user-1',
    roles: (opts.roles as any) ?? ['user'],
  });
  return token;
}

async function makeRefreshTokenStr(cfg: AuthConfig) {
  const kr = new KeyRing(cfg);
  const { token } = await issueRefreshToken(kr, cfg as any, 'user-1');
  return token;
}

// ---------------------------------------------------------------------------
// authenticate decorator
// ---------------------------------------------------------------------------

describe('authenticate', () => {
  let app: Awaited<ReturnType<typeof buildServer>>['app'];
  let cfg: AuthConfig;

  beforeEach(async () => {
    const built = await buildServer();
    app = built.app;
    cfg = built.cfg;
  });

  it('returns 401 MISSING_TOKEN when no Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe('MISSING_TOKEN');
  });

  it('returns 401 MISSING_TOKEN for non-Bearer Authorization', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TOKEN');
  });

  it('returns 200 with valid Bearer token', async () => {
    const token = await makeAccessToken(cfg);
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sub).toBe('user-1');
  });

  it('returns 401 INVALID_ACCESS_TOKEN for tampered token', async () => {
    const token = await makeAccessToken(cfg);
    const parts = token.split('.');
    parts[2] = parts[2]!.slice(0, -4) + 'XXXX';
    const tampered = parts.join('.');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${tampered}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('returns 401 for a refresh token used as access token (wrong aud)', async () => {
    const refreshToken = await makeRefreshTokenStr(cfg);
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${refreshToken}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('returns 401 for completely invalid token string', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('SSE query-param fallback: accepts accessToken query param on /api/events', async () => {
    const token = await makeAccessToken(cfg);
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?accessToken=${token}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sub).toBe('user-1');
  });

  it('SSE query-param fallback: rejects invalid token on /api/events', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/events?accessToken=bad.token',
    });
    expect(res.statusCode).toBe(401);
  });

  it('does NOT use query-param fallback on non-events routes', async () => {
    const token = await makeAccessToken(cfg);
    const res = await app.inject({
      method: 'GET',
      url: `/protected?accessToken=${token}`,
    });
    // No Bearer header → missing token
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// authorize decorator
// ---------------------------------------------------------------------------

describe('authorize', () => {
  let app: Awaited<ReturnType<typeof buildServer>>['app'];
  let cfg: AuthConfig;

  beforeEach(async () => {
    const built = await buildServer();
    app = built.app;
    cfg = built.cfg;
  });

  it('returns 200 for admin user on admin route', async () => {
    const token = await makeAccessToken(cfg, { roles: ['admin'] });
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 403 INSUFFICIENT_ROLE for non-admin user on admin route', async () => {
    const token = await makeAccessToken(cfg, { roles: ['user'] });
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('returns 401 when no token provided for admin route', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(401);
  });
});

  it('handles non-AuthError thrown by verifyAccessTokenAsync (generic 401)', async () => {
    // Mock the auth service to throw a plain Error
    const built = await buildServer();
    const token = await makeAccessToken(built.cfg);
    // Overwrite service's verifyAccessTokenAsync to throw a plain error
    const origVerify = built.app.auth.verifyAccessTokenAsync.bind(built.app.auth);
    built.app.auth.verifyAccessTokenAsync = async () => {
      throw new Error('unexpected internal error');
    };
    const res = await built.app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_ACCESS_TOKEN');
    // Restore
    built.app.auth.verifyAccessTokenAsync = origVerify;
  });

// ---------------------------------------------------------------------------
// authorize without preceding authenticate (edge case)
// ---------------------------------------------------------------------------

describe('authorize called without authenticate setting principal', () => {
  it('returns 401 MISSING_TOKEN when principal is not set', async () => {
    const cfg = makeConfig();
    const db = createTestDb();
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    await app.register(authPlugin, { db: db as any, config: cfg });

    // Route uses only authorize (no authenticate in preHandler)
    app.get(
      '/auth-only-authorize',
      { preHandler: [app.authorize(['admin'])] },
      async () => ({ ok: true }),
    );
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/auth-only-authorize' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('MISSING_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// auth service decorator (fastify.auth)
// ---------------------------------------------------------------------------

describe('fastify.auth service decorator', () => {
  it('exposes fastify.auth.login', async () => {
    const { app } = await buildServer();
    expect(typeof app.auth.login).toBe('function');
  });

  it('exposes fastify.auth.refresh', async () => {
    const { app } = await buildServer();
    expect(typeof app.auth.refresh).toBe('function');
  });

  it('exposes fastify.auth.logout', async () => {
    const { app } = await buildServer();
    expect(typeof app.auth.logout).toBe('function');
  });
});
