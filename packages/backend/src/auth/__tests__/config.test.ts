import { describe, it, expect } from 'vitest';
import { loadAuthConfig } from '../config.js';

function validEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const keyPayload = JSON.stringify({ v1: Buffer.from('a'.repeat(32)).toString('base64') });
  return {
    AUTH_JWT_KEYS: keyPayload,
    AUTH_CURRENT_KID: 'v1',
    ...overrides,
  };
}

describe('loadAuthConfig', () => {
  it('loads valid config from env', () => {
    const cfg = loadAuthConfig(validEnv());
    expect(cfg.currentKid).toBe('v1');
    expect(cfg.issuer).toBe('agentic-dev');
    expect(cfg.audienceAccess).toBe('agentic-dev-api');
    expect(cfg.audienceRefresh).toBe('agentic-dev-refresh');
    expect(cfg.accessTtlSeconds).toBe(900);
    expect(cfg.refreshTtlSeconds).toBe(1209600);
    expect(cfg.clockSkewSeconds).toBe(30);
    expect(cfg.loginRateMax).toBe(5);
    expect(cfg.loginRateWindowSeconds).toBe(900);
  });

  it('applies custom overrides', () => {
    const cfg = loadAuthConfig(validEnv({
      AUTH_ISSUER: 'my-issuer',
      AUTH_AUDIENCE_ACCESS: 'my-api',
      AUTH_AUDIENCE_REFRESH: 'my-refresh',
      AUTH_ACCESS_TTL_SECONDS: '300',
      AUTH_REFRESH_TTL_SECONDS: '600',
      AUTH_CLOCK_SKEW_SECONDS: '10',
      AUTH_LOGIN_RATE_MAX: '3',
      AUTH_LOGIN_RATE_WINDOW_SECONDS: '120',
    }));
    expect(cfg.issuer).toBe('my-issuer');
    expect(cfg.audienceAccess).toBe('my-api');
    expect(cfg.audienceRefresh).toBe('my-refresh');
    expect(cfg.accessTtlSeconds).toBe(300);
    expect(cfg.refreshTtlSeconds).toBe(600);
    expect(cfg.clockSkewSeconds).toBe(10);
    expect(cfg.loginRateMax).toBe(3);
    expect(cfg.loginRateWindowSeconds).toBe(120);
  });

  it('throws if AUTH_JWT_KEYS is missing', () => {
    expect(() =>
      loadAuthConfig({ AUTH_CURRENT_KID: 'v1' }),
    ).toThrow('Missing required environment variable: AUTH_JWT_KEYS');
  });

  it('throws if AUTH_CURRENT_KID is missing', () => {
    const keyPayload = JSON.stringify({ v1: Buffer.from('a'.repeat(32)).toString('base64') });
    expect(() =>
      loadAuthConfig({ AUTH_JWT_KEYS: keyPayload }),
    ).toThrow('Missing required environment variable: AUTH_CURRENT_KID');
  });

  it('throws if a key is shorter than 32 bytes', () => {
    const shortKey = JSON.stringify({ v1: Buffer.from('short').toString('base64') });
    expect(() =>
      loadAuthConfig({ AUTH_JWT_KEYS: shortKey, AUTH_CURRENT_KID: 'v1' }),
    ).toThrow('must be >= 256 bits');
  });

  it('throws if currentKid is not in keys', () => {
    const keyPayload = JSON.stringify({ v1: Buffer.from('a'.repeat(32)).toString('base64') });
    expect(() =>
      loadAuthConfig({ AUTH_JWT_KEYS: keyPayload, AUTH_CURRENT_KID: 'v2' }),
    ).toThrow('AUTH_CURRENT_KID not present in AUTH_JWT_KEYS');
  });

  it('supports multiple keys', () => {
    const multiKey = JSON.stringify({
      v1: Buffer.from('a'.repeat(32)).toString('base64'),
      v2: Buffer.from('b'.repeat(32)).toString('base64'),
    });
    const cfg = loadAuthConfig({ AUTH_JWT_KEYS: multiKey, AUTH_CURRENT_KID: 'v2' });
    expect(Object.keys(cfg.keys)).toHaveLength(2);
    expect(cfg.currentKid).toBe('v2');
  });

  it('converts base64 strings to Buffer instances', () => {
    const cfg = loadAuthConfig(validEnv());
    expect(cfg.keys['v1']).toBeInstanceOf(Buffer);
    expect(cfg.keys['v1']!.length).toBe(32);
  });
});
