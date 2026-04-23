import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthError } from '../auth/errors.js';
import { createLoginRateLimitConfig } from '../auth/rate-limit.js';

const LoginBody = z.object({
  email: z.string().email().max(256),
  password: z.string().min(1).max(1024),
});

const RefreshBody = z.object({
  refreshToken: z.string().min(1).max(4096),
});

const LogoutBody = z.object({
  refreshToken: z.string().min(1).max(4096),
});

export default async function authRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const rateLimitConfig = createLoginRateLimitConfig(
    (fastify as any).authConfig,
  );

  fastify.post(
    '/auth/login',
    { config: { rateLimit: rateLimitConfig } },
    async (request, reply) => {
      const parsed = LoginBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: parsed.error.message },
        });
      }
      try {
        const res = await fastify.auth.login({
          email: parsed.data.email,
          password: parsed.data.password,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
        return reply.code(200).send(res);
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.httpStatus).send(err.toBody());
        }
        throw err;
      }
    },
  );

  fastify.post('/auth/refresh', async (request, reply) => {
    const parsed = RefreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'INVALID_REQUEST', message: parsed.error.message },
      });
    }
    try {
      const res = await fastify.auth.refresh({
        refreshToken: parsed.data.refreshToken,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
      return reply.code(200).send(res);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.httpStatus).send(err.toBody());
      }
      throw err;
    }
  });

  fastify.post(
    '/auth/logout',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = LogoutBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'INVALID_REQUEST', message: parsed.error.message },
        });
      }
      try {
        await fastify.auth.logout({
          refreshToken: parsed.data.refreshToken,
          actor: request.principal!,
        });
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof AuthError) {
          return reply.code(err.httpStatus).send(err.toBody());
        }
        throw err;
      }
    },
  );
}
