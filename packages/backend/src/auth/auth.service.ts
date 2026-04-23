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

/**
 * Core authentication service.
 *
 * Handles the login, refresh, logout, and access-token verification flows.
 * All security-sensitive decisions (timing-safe password comparison, reuse
 * detection, token rotation) live here rather than in route handlers.
 */
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly audit: AuditWriter,
    private readonly keyRing: KeyRing,
    private readonly cfg: AuthConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /**
   * Authenticates a user with email and password.
   *
   * Issues a short-lived access token (default 15 min) and a rotating refresh
   * token (default 14 days). The refresh token is stored as a SHA-256 hash in
   * the database so a DB leak does not expose usable tokens.
   *
   * Timing is equalised for unknown-email vs wrong-password paths to prevent
   * user enumeration.
   *
   * @throws {AuthError} `INVALID_CREDENTIALS` — wrong email, wrong password, or
   *   the account status is not `active`. The same error code is returned for all
   *   three cases to avoid information disclosure.
   * @throws {AuthError} `RATE_LIMITED` — too many attempts from the same IP/email
   *   within the configured window (enforced at the route layer).
   */
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

  /**
   * Exchanges a refresh token for a new access + refresh token pair.
   *
   * Implements token rotation: the supplied refresh token is revoked and a new
   * one is issued atomically. This limits the window of damage if a refresh
   * token is stolen.
   *
   * **Reuse detection**: if the presented refresh token has already been
   * revoked (i.e. it has been used before), all active refresh tokens for the
   * affected user are immediately revoked and a `refresh_reuse_detected` audit
   * event is emitted. This is the OAuth 2 Security BCP recommended pattern.
   *
   * @throws {AuthError} `INVALID_REFRESH_TOKEN` — signature invalid, token
   *   expired, token revoked, unknown JTI, hash mismatch, wrong audience, or
   *   reuse detected. All cases return the same error code to avoid leaking
   *   which check failed.
   */
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

  /**
   * Revokes the supplied refresh token.
   *
   * Idempotent: silently succeeds if the token is already revoked, expired, or
   * unknown. This prevents a logout attempt from leaking token-state information
   * to a caller.
   *
   * The route layer requires a valid access token (`authenticate` preHandler)
   * so `actor` is always the authenticated principal.
   */
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

  /** @deprecated Use {@link verifyAccessTokenAsync} — jose requires async verification. */
  verifyAccessToken(token: string): AuthPrincipal {
    // This is sync-looking but we need async for jose.jwtVerify
    // We'll handle this via a wrapper that caches the promise result
    throw new Error('Use verifyAccessTokenAsync instead');
  }

  /**
   * Verifies an access token and returns the decoded principal.
   *
   * Called by the `authenticate` Fastify preHandler on every protected request.
   * Zero DB reads — verification is purely cryptographic (HS256 + claims check).
   *
   * @returns The authenticated principal (`sub`, `roles`, `jti`).
   * @throws {AuthError} `INVALID_ACCESS_TOKEN` — signature invalid, token
   *   expired, wrong audience, or unknown key ID.
   */
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
