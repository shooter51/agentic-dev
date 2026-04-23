import { describe, it, expect } from 'vitest';
import { createLoginRateLimitConfig } from '../rate-limit.js';
import type { AuthConfig } from '../config.js';

function makeConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    keys: { v1: Buffer.from('a'.repeat(32)) },
    currentKid: 'v1',
    issuer: 'test',
    audienceAccess: 'api',
    audienceRefresh: 'refresh',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 1209600,
    clockSkewSeconds: 30,
    loginRateMax: 5,
    loginRateWindowSeconds: 900,
    ...overrides,
  };
}

describe('createLoginRateLimitConfig', () => {
  it('sets max from config', () => {
    const cfg = createLoginRateLimitConfig(makeConfig({ loginRateMax: 10 }));
    expect(cfg.max).toBe(10);
  });

  it('sets timeWindow from config', () => {
    const cfg = createLoginRateLimitConfig(makeConfig({ loginRateWindowSeconds: 300 }));
    expect(cfg.timeWindow).toBe('300 seconds');
  });

  describe('keyGenerator', () => {
    it('returns ip:emailHash key', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'user@example.com' } });
      expect(key).toMatch(/^1\.2\.3\.4:[0-9a-f]{16}$/);
    });

    it('uses anon when email is missing', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key = cfg.keyGenerator({ ip: '1.2.3.4', body: {} });
      expect(key).toBe('1.2.3.4:anon');
    });

    it('uses anon when body is undefined', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key = cfg.keyGenerator({ ip: '1.2.3.4', body: undefined });
      expect(key).toBe('1.2.3.4:anon');
    });

    it('lowercases email before hashing (same key for different case)', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key1 = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'User@EXAMPLE.COM' } });
      const key2 = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'user@example.com' } });
      expect(key1).toBe(key2);
    });

    it('different emails produce different keys', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key1 = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'a@example.com' } });
      const key2 = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'b@example.com' } });
      expect(key1).not.toBe(key2);
    });

    it('different IPs produce different keys', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const key1 = cfg.keyGenerator({ ip: '1.2.3.4', body: { email: 'a@example.com' } });
      const key2 = cfg.keyGenerator({ ip: '5.6.7.8', body: { email: 'a@example.com' } });
      expect(key1).not.toBe(key2);
    });
  });

  describe('errorResponseBuilder', () => {
    it('returns RATE_LIMITED error envelope', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const response = cfg.errorResponseBuilder({}, { after: 30000 });
      expect(response.error.code).toBe('RATE_LIMITED');
      expect(response.error.message).toBe('Too many login attempts');
      expect(response.error.retryAfterSeconds).toBe(30);
    });

    it('rounds up retryAfterSeconds', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const response = cfg.errorResponseBuilder({}, { after: 30500 });
      expect(response.error.retryAfterSeconds).toBe(31);
    });

    it('handles zero after', () => {
      const cfg = createLoginRateLimitConfig(makeConfig());
      const response = cfg.errorResponseBuilder({}, { after: 0 });
      expect(response.error.retryAfterSeconds).toBe(0);
    });
  });
});
