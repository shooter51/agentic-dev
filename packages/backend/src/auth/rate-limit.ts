import { createHash } from 'crypto';
import type { AuthConfig } from './config.js';

export function createLoginRateLimitConfig(cfg: AuthConfig) {
  return {
    max: cfg.loginRateMax,
    timeWindow: `${cfg.loginRateWindowSeconds} seconds`,
    keyGenerator: (req: any) => {
      const body = req.body as { email?: string } | undefined;
      const emailKey = body?.email
        ? createHash('sha256')
            .update(body.email.toLowerCase())
            .digest('hex')
            .slice(0, 16)
        : 'anon';
      return `${req.ip}:${emailKey}`;
    },
    errorResponseBuilder: (_req: any, ctx: any) => ({
      error: {
        code: 'RATE_LIMITED' as const,
        message: 'Too many login attempts',
        retryAfterSeconds: Math.ceil(ctx.after / 1000),
      },
    }),
  };
}
