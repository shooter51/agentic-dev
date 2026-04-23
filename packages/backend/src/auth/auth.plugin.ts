import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import type { UserRole } from '@agentic-dev/shared';
import type { AuthConfig } from './config.js';
import type { DB } from '../db/index.js';
import { UserRepository } from '../db/repositories/user.repository.js';
import { RefreshTokenRepository } from '../db/repositories/refresh-token.repository.js';
import { AuthAuditRepository } from '../db/repositories/auth-audit.repository.js';
import { KeyRing } from './key-ring.js';
import { AuditWriter } from './audit.js';
import { AuthService } from './auth.service.js';
import { AuthError } from './errors.js';
import './principal.js';

export interface AuthPluginOptions {
  db: DB;
  config: AuthConfig;
}

const authPluginFn: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify,
  opts,
) => {
  const userRepo = new UserRepository(opts.db);
  const refreshTokenRepo = new RefreshTokenRepository(opts.db);
  const auditRepo = new AuthAuditRepository(opts.db);
  const keyRing = new KeyRing(opts.config);
  const auditWriter = new AuditWriter(auditRepo);

  const service = new AuthService(
    userRepo,
    refreshTokenRepo,
    auditWriter,
    keyRing,
    opts.config,
  );

  fastify.decorate('auth', service);

  fastify.decorate('authenticate', async function authenticate(
    request: any,
    reply: any,
  ) {
    const header = request.headers.authorization;
    let token: string | null = null;

    if (header && header.startsWith('Bearer ')) {
      token = header.slice(7);
    }

    // SSE query-param fallback
    if (!token && request.url?.includes('/api/events')) {
      const url = new URL(request.url, 'http://localhost');
      token = url.searchParams.get('accessToken');
    }

    if (!token) {
      return reply.code(401).send({
        error: { code: 'MISSING_TOKEN', message: 'Authentication required' },
      });
    }

    try {
      request.principal = await service.verifyAccessTokenAsync(token);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.httpStatus).send(err.toBody());
      }
      return reply.code(401).send({
        error: {
          code: 'INVALID_ACCESS_TOKEN',
          message: 'Invalid or expired access token',
        },
      });
    }
  });

  fastify.decorate(
    'authorize',
    (roles: UserRole[]) =>
      async function authorizeHandler(request: any, reply: any) {
        if (!request.principal) {
          return reply.code(401).send({
            error: {
              code: 'MISSING_TOKEN',
              message: 'Authentication required',
            },
          });
        }
        const ok = roles.some((r: UserRole) =>
          request.principal!.roles.includes(r),
        );
        if (!ok) {
          return reply.code(403).send({
            error: {
              code: 'INSUFFICIENT_ROLE',
              message: 'Insufficient role',
            },
          });
        }
      },
  );
};

export const authPlugin = fp(authPluginFn, {
  name: 'auth',
  fastify: '5.x',
});
