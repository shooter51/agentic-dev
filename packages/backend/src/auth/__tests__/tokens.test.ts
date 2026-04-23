import { describe, it, expect } from 'vitest';
import * as jose from 'jose';
import { issueAccessToken, issueRefreshToken } from '../tokens.js';
import { KeyRing } from '../key-ring.js';
import type { AuthConfig } from '../config.js';

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  const key = Buffer.from('a'.repeat(32));
  return {
    keys: { v1: key },
    currentKid: 'v1',
    issuer: 'test-issuer',
    audienceAccess: 'test-api',
    audienceRefresh: 'test-refresh',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 1209600,
    clockSkewSeconds: 30,
    loginRateMax: 5,
    loginRateWindowSeconds: 900,
    ...overrides,
  };
}

describe('issueAccessToken', () => {
  it('returns a token and jti', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token, jti } = await issueAccessToken(kr, cfg, {
      id: 'user-1',
      roles: ['user'],
    });
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
    expect(typeof jti).toBe('string');
    expect(jti.length).toBeGreaterThan(0);
  });

  it('embeds correct claims', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token } = await issueAccessToken(kr, cfg, {
      id: 'user-abc',
      roles: ['user', 'admin'],
    });
    const { payload } = await kr.verify(token, { aud: cfg.audienceAccess });
    expect(payload.sub).toBe('user-abc');
    expect(payload.roles).toEqual(['user', 'admin']);
    expect(payload.iss).toBe('test-issuer');
    expect(payload.aud).toBe('test-api');
    expect(payload.jti).toBeDefined();
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
  });

  it('exp is iat + accessTtlSeconds', async () => {
    const cfg = makeConfig({ accessTtlSeconds: 300 });
    const kr = new KeyRing(cfg);
    const before = Math.floor(Date.now() / 1000);
    const { token } = await issueAccessToken(kr, cfg, {
      id: 'user-x',
      roles: ['user'],
    });
    const { payload } = await kr.verify(token, { aud: cfg.audienceAccess });
    const exp = payload.exp as number;
    const iat = payload.iat as number;
    expect(exp - iat).toBe(300);
    expect(iat).toBeGreaterThanOrEqual(before);
  });

  it('audience is audienceAccess (not audienceRefresh)', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token } = await issueAccessToken(kr, cfg, {
      id: 'user-1',
      roles: ['user'],
    });
    // Should fail with refresh audience
    await expect(kr.verify(token, { aud: cfg.audienceRefresh })).rejects.toThrow();
  });

  it('produces unique jti values', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const a = await issueAccessToken(kr, cfg, { id: 'u1', roles: ['user'] });
    const b = await issueAccessToken(kr, cfg, { id: 'u1', roles: ['user'] });
    expect(a.jti).not.toBe(b.jti);
  });

  it('header contains correct kid', async () => {
    const cfg = makeConfig({ currentKid: 'v1' });
    const kr = new KeyRing(cfg);
    const { token } = await issueAccessToken(kr, cfg, { id: 'u1', roles: [] });
    const header = jose.decodeProtectedHeader(token);
    expect(header.kid).toBe('v1');
    expect(header.alg).toBe('HS256');
  });
});

describe('issueRefreshToken', () => {
  it('returns a token and jti', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token, jti } = await issueRefreshToken(kr, cfg, 'user-1');
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);
    expect(typeof jti).toBe('string');
  });

  it('embeds typ=refresh claim', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token } = await issueRefreshToken(kr, cfg, 'user-1');
    const { payload } = await kr.verify(token, { aud: cfg.audienceRefresh });
    expect(payload.typ).toBe('refresh');
  });

  it('audience is audienceRefresh (not audienceAccess)', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token } = await issueRefreshToken(kr, cfg, 'user-1');
    await expect(kr.verify(token, { aud: cfg.audienceAccess })).rejects.toThrow();
  });

  it('exp is iat + refreshTtlSeconds', async () => {
    const cfg = makeConfig({ refreshTtlSeconds: 600 });
    const kr = new KeyRing(cfg);
    const { token } = await issueRefreshToken(kr, cfg, 'user-x');
    const { payload } = await kr.verify(token, { aud: cfg.audienceRefresh });
    const exp = payload.exp as number;
    const iat = payload.iat as number;
    expect(exp - iat).toBe(600);
  });

  it('produces unique jti values', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const a = await issueRefreshToken(kr, cfg, 'u1');
    const b = await issueRefreshToken(kr, cfg, 'u1');
    expect(a.jti).not.toBe(b.jti);
  });

  it('jti in token matches returned jti', async () => {
    const cfg = makeConfig();
    const kr = new KeyRing(cfg);
    const { token, jti } = await issueRefreshToken(kr, cfg, 'user-1');
    const { payload } = await kr.verify(token, { aud: cfg.audienceRefresh });
    expect(payload.jti).toBe(jti);
  });
});
