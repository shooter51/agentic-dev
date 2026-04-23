import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { AuthService } from '../auth.service.js';
import { AuthError } from '../errors.js';
import { KeyRing } from '../key-ring.js';
import { hashPassword } from '../password.js';
import type { AuthConfig } from '../config.js';
import type { UserRepository } from '../../db/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../../db/repositories/refresh-token.repository.js';
import type { AuditWriter } from '../audit.js';
import type { UserRow } from '../../db/schema/users.js';
import type { RefreshTokenRow } from '../../db/schema/refresh-tokens.js';

// ---------------------------------------------------------------------------
// Test helpers
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

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: '$argon2id$placeholder',
    roles: JSON.stringify(['user']),
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRefreshTokenRow(
  jti: string,
  userId: string,
  overrides: Partial<RefreshTokenRow> = {},
): RefreshTokenRow {
  const future = new Date(Date.now() + 86400 * 1000).toISOString();
  return {
    jti,
    userId,
    tokenHash: '',
    expiresAt: future,
    revokedAt: null,
    replacedBy: null,
    ip: null,
    userAgent: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockUserRepo(): jest.Mocked<UserRepository> {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    countAll: vi.fn(),
  } as any;
}

function makeMockRefreshRepo(): jest.Mocked<RefreshTokenRepository> {
  return {
    findByJti: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    revokeAndReplace: vi.fn(),
    revokeAllForUser: vi.fn(),
  } as any;
}

function makeMockAudit(): jest.Mocked<AuditWriter> {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// Build an AuthService with mocked dependencies
async function buildService(overrides: {
  userRow?: Partial<UserRow> | null;
  tokenRow?: RefreshTokenRow | null;
  passwordOverride?: string;
} = {}) {
  const cfg = makeConfig();
  const keyRing = new KeyRing(cfg);

  const passwordHash =
    overrides.userRow === null
      ? null
      : await hashPassword(overrides.passwordOverride ?? 'correct-password');

  const user =
    overrides.userRow === null
      ? null
      : makeUserRow({ passwordHash: passwordHash ?? '', ...overrides.userRow });

  const userRepo = makeMockUserRepo();
  (userRepo.findByEmail as Mock).mockResolvedValue(user);
  (userRepo.findById as Mock).mockResolvedValue(user);

  const refreshRepo = makeMockRefreshRepo();
  (refreshRepo.create as Mock).mockResolvedValue(undefined);
  (refreshRepo.revoke as Mock).mockResolvedValue(undefined);
  (refreshRepo.revokeAndReplace as Mock).mockResolvedValue(undefined);
  (refreshRepo.revokeAllForUser as Mock).mockResolvedValue(undefined);

  if (overrides.tokenRow !== undefined) {
    (refreshRepo.findByJti as Mock).mockResolvedValue(overrides.tokenRow);
  } else {
    (refreshRepo.findByJti as Mock).mockResolvedValue(null);
  }

  const audit = makeMockAudit();
  const clock = () => new Date();

  const service = new AuthService(userRepo, refreshRepo, audit, keyRing, cfg, clock);
  return { service, userRepo, refreshRepo, audit, keyRing, cfg, user };
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('AuthService.login', () => {
  it('returns LoginResponse on valid credentials', async () => {
    const { service } = await buildService();
    const result = await service.login({
      email: 'Test@Example.COM',
      password: 'correct-password',
    });
    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(900);
  });

  it('normalises email to lowercase', async () => {
    const { service, userRepo } = await buildService();
    await service.login({ email: 'Test@EXAMPLE.COM', password: 'correct-password' });
    expect((userRepo.findByEmail as Mock).mock.calls[0][0]).toBe('test@example.com');
  });

  it('throws INVALID_CREDENTIALS for unknown user', async () => {
    const { service, audit } = await buildService({ userRow: null });
    await expect(
      service.login({ email: 'nobody@example.com', password: 'any' }),
    ).rejects.toThrow(AuthError);
    expect((audit.log as Mock).mock.calls[0][0].event).toBe('login_failure');
  });

  it('throws INVALID_CREDENTIALS for wrong password', async () => {
    const { service } = await buildService();
    await expect(
      service.login({ email: 'test@example.com', password: 'wrong-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throws INVALID_CREDENTIALS for disabled user', async () => {
    const { service } = await buildService({ userRow: { status: 'disabled' } });
    await expect(
      service.login({ email: 'test@example.com', password: 'correct-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('creates a refresh-token row in the DB', async () => {
    const { service, refreshRepo } = await buildService();
    await service.login({ email: 'test@example.com', password: 'correct-password' });
    expect(refreshRepo.create).toHaveBeenCalledOnce();
    const row = (refreshRepo.create as Mock).mock.calls[0][0];
    expect(row.userId).toBe('user-1');
    expect(row.revokedAt).toBeNull();
    expect(row.tokenHash).toBeTruthy();
  });

  it('audits login_success on success', async () => {
    const { service, audit } = await buildService();
    await service.login({ email: 'test@example.com', password: 'correct-password' });
    const events = (audit.log as Mock).mock.calls.map((c: any[]) => c[0].event);
    expect(events).toContain('login_success');
  });

  it('passes ip and userAgent through to audit', async () => {
    const { service, audit } = await buildService();
    await service.login({
      email: 'test@example.com',
      password: 'correct-password',
      ip: '1.2.3.4',
      userAgent: 'TestAgent/1.0',
    });
    const successCall = (audit.log as Mock).mock.calls.find(
      (c: any[]) => c[0].event === 'login_success',
    );
    expect(successCall![0].ip).toBe('1.2.3.4');
    expect(successCall![0].userAgent).toBe('TestAgent/1.0');
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe('AuthService.refresh', () => {
  it('returns new tokens on valid refresh token', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);

    // Issue a real refresh token
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const tokenRow = makeRefreshTokenRow(jti, 'user-1', { tokenHash });

    const { service, refreshRepo } = await buildService({ tokenRow });
    const result = await service.refresh({ refreshToken });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.tokenType).toBe('Bearer');
    expect(refreshRepo.revokeAndReplace).toHaveBeenCalledOnce();
    expect(refreshRepo.create).toHaveBeenCalledOnce();
  });

  it('throws INVALID_REFRESH_TOKEN for unknown jti', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { service } = await buildService({ tokenRow: null });
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('detects reuse: revokes all user tokens and throws', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    // Token is already revoked
    const tokenRow = makeRefreshTokenRow(jti, 'user-1', {
      tokenHash,
      revokedAt: new Date().toISOString(),
    });

    const { service, refreshRepo, audit } = await buildService({ tokenRow });
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith('user-1', expect.any(String));
    const events = (audit.log as Mock).mock.calls.map((c: any[]) => c[0].event);
    expect(events).toContain('refresh_reuse_detected');
  });

  it('throws INVALID_REFRESH_TOKEN for expired stored token', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const tokenRow = makeRefreshTokenRow(jti, 'user-1', { tokenHash, expiresAt: pastDate });

    const { service } = await buildService({ tokenRow });
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN for token hash mismatch', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    // Store a different hash
    const tokenRow = makeRefreshTokenRow(jti, 'user-1', { tokenHash: 'wrong-hash' });

    const { service } = await buildService({ tokenRow });
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN when user is disabled', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const tokenRow = makeRefreshTokenRow(jti, 'user-1', { tokenHash });

    const { service } = await buildService({ tokenRow, userRow: { status: 'disabled' } });
    await expect(service.refresh({ refreshToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN when given an access token (wrong aud)', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueAccessToken } = await import('../tokens.js');
    const { token: accessToken } = await issueAccessToken(keyRing, cfg, {
      id: 'user-1',
      roles: ['user'],
    });

    const { service } = await buildService();
    await expect(service.refresh({ refreshToken: accessToken })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN for completely invalid token', async () => {
    const { service } = await buildService();
    await expect(service.refresh({ refreshToken: 'not.a.jwt' })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });

  it('throws INVALID_REFRESH_TOKEN for token with correct aud but missing typ=refresh', async () => {
    // Build a token with audienceRefresh but no typ:refresh claim
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const token = await keyRing.sign(
      { sub: 'user-1', jti: 'some-jti' },  // no typ field
      { aud: cfg.audienceRefresh, ttlSeconds: 900 },
    );

    const { service } = await buildService();
    await expect(service.refresh({ refreshToken: token })).rejects.toMatchObject({
      code: 'INVALID_REFRESH_TOKEN',
    });
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('AuthService.logout', () => {
  it('revokes refresh token and audits logout', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token: refreshToken, jti } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { service, refreshRepo, audit } = await buildService();
    await service.logout({
      refreshToken,
      actor: { sub: 'user-1', roles: ['user'], jti: 'access-jti' },
    });

    expect(refreshRepo.revoke).toHaveBeenCalledWith(jti, expect.any(String));
    expect((audit.log as Mock).mock.calls[0][0].event).toBe('logout');
  });

  it('is idempotent: does not throw for invalid/unknown refresh token', async () => {
    const { service } = await buildService();
    await expect(
      service.logout({
        refreshToken: 'not.a.valid.token',
        actor: { sub: 'user-1', roles: ['user'], jti: 'jti' },
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// verifyAccessToken / verifyAccessTokenAsync
// ---------------------------------------------------------------------------

describe('AuthService.verifyAccessTokenAsync', () => {
  it('returns AuthPrincipal for valid access token', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueAccessToken } = await import('../tokens.js');
    const { token } = await issueAccessToken(keyRing, cfg, {
      id: 'user-1',
      roles: ['user', 'admin'],
    });

    const { service } = await buildService();
    const principal = await service.verifyAccessTokenAsync(token);
    expect(principal.sub).toBe('user-1');
    expect(principal.roles).toEqual(['user', 'admin']);
    expect(principal.jti).toBeDefined();
  });

  it('throws INVALID_ACCESS_TOKEN for invalid token', async () => {
    const { service } = await buildService();
    await expect(service.verifyAccessTokenAsync('bad.token')).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN',
    });
  });

  it('throws when given a refresh token (wrong aud)', async () => {
    const cfg = makeConfig();
    const keyRing = new KeyRing(cfg);
    const { issueRefreshToken } = await import('../tokens.js');
    const { token } = await issueRefreshToken(keyRing, cfg, 'user-1');

    const { service } = await buildService();
    await expect(service.verifyAccessTokenAsync(token)).rejects.toMatchObject({
      code: 'INVALID_ACCESS_TOKEN',
    });
  });
});

describe('AuthService.verifyAccessToken (sync stub)', () => {
  it('throws with a helpful message', async () => {
    const { service } = await buildService();
    expect(() => service.verifyAccessToken('any-token')).toThrow(
      'Use verifyAccessTokenAsync instead',
    );
  });
});
