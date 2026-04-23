import { ulid } from 'ulid';
import type { UserRole } from '@agentic-dev/shared';
import type { KeyRing } from './key-ring.js';
import type { AuthConfig } from './config.js';

export interface AccessTokenPayload {
  sub: string;
  roles: UserRole[];
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

export async function issueAccessToken(
  keyRing: KeyRing,
  cfg: AuthConfig,
  user: { id: string; roles: UserRole[] },
): Promise<{ token: string; jti: string }> {
  const jti = ulid();
  const token = await keyRing.sign(
    { sub: user.id, roles: user.roles, jti },
    { aud: cfg.audienceAccess, ttlSeconds: cfg.accessTtlSeconds },
  );
  return { token, jti };
}

export async function issueRefreshToken(
  keyRing: KeyRing,
  cfg: AuthConfig,
  userId: string,
): Promise<{ token: string; jti: string }> {
  const jti = ulid();
  const token = await keyRing.sign(
    { sub: userId, jti, typ: 'refresh' },
    { aud: cfg.audienceRefresh, ttlSeconds: cfg.refreshTtlSeconds },
  );
  return { token, jti };
}
