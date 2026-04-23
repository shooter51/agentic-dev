import { createHash } from 'crypto';
import type { AuthAuditRepository } from '../db/repositories/auth-audit.repository.js';

export type AuditEvent =
  | 'login_success'
  | 'login_failure'
  | 'refresh'
  | 'refresh_reuse_detected'
  | 'logout'
  | 'token_rejected';

export function hashEmail(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
}

export class AuditWriter {
  constructor(private readonly repo: AuthAuditRepository) {}

  async log(params: {
    event: AuditEvent;
    userId?: string;
    email?: string;
    ip?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.repo.log({
      event: params.event,
      userId: params.userId ?? null,
      emailHash: params.email ? hashEmail(params.email) : null,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      details: params.details ? JSON.stringify(params.details) : null,
    });
  }
}
