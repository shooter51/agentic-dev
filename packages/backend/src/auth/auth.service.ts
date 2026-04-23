import { createHash } from 'crypto';
import type { AuthPrincipal, LoginResponse, UserRole } from '@agentic-dev/shared';
import type { UserRepository } from '../db/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../db/repositories/refresh-token.repository.js';
import { AuthError } from './errors.js';
import type { KeyRing } from './key-ring.js';
import type { AuthConfig } from './config.js';
import type { AuditWriter } from './audit.js';
import { verifyPassword } from './password.js';
import { issueAccessToken, issueRefreshToken } from './tokens.js';

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditWriter,
    private readonly keyRing: KeyRing,
    private readonly cfg: AuthConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async login(input: {
    email: string;
    password: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResponse> {
    const email = input.email.trim().toLowerCase();
    const user = await this.users.findByEmail(email);

    const ok = await verifyPassword(input.password, user?.passwordHash ?? null);

    if (!ok || !user || user.status !== 'active') {
      await this.audit.log({
        event: 'login_failure',
        userId: user?.id,
        email,
        ip: input.ip,
        userAgent: input.userAgent,
      });
      throw AuthError.invalidCredentials();
    }

    const roles = JSON.parse(user.roles) as UserRole[];
    const access = await issueAccessToken(this.keyRing, this.cfg, {
      id: user.id,
      roles,
    });
    const refresh = await issueRefreshToken(this.keyRing, this.cfg, user.id);

    const now = this.clock().toISOString();
    const expiresAt = new Date(
      this.clock().getTime() + this.cfg.refreshTtlSeconds * 1000,
    ).toISOString();

    await this.refreshTokens.create({
      jti: refresh.jti,
      userId: user.id,
      tokenHash: sha256(refresh.token),
      expiresAt,
      revokedAt: null,
      replacedBy: null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    });

    await this.audit.log({
      event: 'login_success',
      userId: user.id,
      email,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresIn: this.cfg.accessTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  async refresh(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginResponse> {
    let payload: any;
    try {
      const result = await this.keyRing.verify(input.refreshToken, {
        aud: this.cfg.audienceRefresh,
      });
      payload = result.payload;
    } catch {
      throw AuthError.invalidRefreshToken();
    }

    if (payload.typ !== 'refresh') {
      throw AuthError.invalidRefreshToken();
    }

    const storedToken = await this.refreshTokens.findByJti(payload.jti);
    if (!storedToken) {
      throw AuthError.invalidRefreshToken();
    }

    // Verify token hash matches
    const incomingHash = sha256(input.refreshToken);
    if (storedToken.tokenHash !== incomingHash) {
      throw AuthError.invalidRefreshToken();
    }

    // Check if token has been revoked — reuse detection
    if (storedToken.revokedAt) {
      // Reuse detected! Revoke all tokens for this user
      const now = this.clock().toISOString();
      await this.refreshTokens.revokeAllForUser(storedToken.userId, now);
      await this.audit.log({
        event: 'refresh_reuse_detected',
        userId: storedToken.userId,
        ip: input.ip,
        userAgent: input.userAgent,
        details: { reusedJti: payload.jti },
      });
      throw AuthError.invalidRefreshToken();
    }

    // Check expiry
    if (new Date(storedToken.expiresAt) < this.clock()) {
      throw AuthError.invalidRefreshToken();
    }

    // Lookup user
    const user = await this.users.findById(storedToken.userId);
    if (!user || user.status !== 'active') {
      throw AuthError.invalidRefreshToken();
    }

    const roles = JSON.parse(user.roles) as UserRole[];

    // Issue new tokens
    const newAccess = await issueAccessToken(this.keyRing, this.cfg, {
      id: user.id,
      roles,
    });
    const newRefresh = await issueRefreshToken(this.keyRing, this.cfg, user.id);

    const now = this.clock().toISOString();
    const expiresAt = new Date(
      this.clock().getTime() + this.cfg.refreshTtlSeconds * 1000,
    ).toISOString();

    // Revoke old, insert new (rotate)
    await this.refreshTokens.revokeAndReplace(payload.jti, newRefresh.jti, now);
    await this.refreshTokens.create({
      jti: newRefresh.jti,
      userId: user.id,
      tokenHash: sha256(newRefresh.token),
      expiresAt,
      revokedAt: null,
      replacedBy: null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    });

    await this.audit.log({
      event: 'refresh',
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return {
      accessToken: newAccess.token,
      refreshToken: newRefresh.token,
      expiresIn: this.cfg.accessTtlSeconds,
      tokenType: 'Bearer',
    };
  }

  async logout(input: {
    refreshToken: string;
    actor: AuthPrincipal;
  }): Promise<void> {
    let payload: any;
    try {
      const result = await this.keyRing.verify(input.refreshToken, {
        aud: this.cfg.audienceRefresh,
      });
      payload = result.payload;
    } catch {
      // Idempotent — if token is invalid, just return
      return;
    }

    const now = this.clock().toISOString();
    await this.refreshTokens.revoke(payload.jti, now);

    await this.audit.log({
      event: 'logout',
      userId: input.actor.sub,
    });
  }

  verifyAccessToken(token: string): AuthPrincipal {
    // This is sync-looking but we need async for jose.jwtVerify
    // We'll handle this via a wrapper that caches the promise result
    throw new Error('Use verifyAccessTokenAsync instead');
  }

  async verifyAccessTokenAsync(token: string): Promise<AuthPrincipal> {
    try {
      const { payload } = await this.keyRing.verify(token, {
        aud: this.cfg.audienceAccess,
      });
      return {
        sub: payload.sub as string,
        roles: payload.roles as UserRole[],
        jti: payload.jti as string,
      };
    } catch {
      throw AuthError.invalidAccessToken();
    }
  }
}
