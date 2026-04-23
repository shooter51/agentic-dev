import { ulid } from 'ulid';
import { authAuditLog } from '../schema/auth-audit-log';
import type { NewAuthAuditRow } from '../schema/auth-audit-log';
import type { DB } from '../index';

export class AuthAuditRepository {
  constructor(private db: DB) {}

  async log(
    data: Omit<NewAuthAuditRow, 'id' | 'createdAt'>,
  ): Promise<void> {
    await this.db.insert(authAuditLog).values({
      id: ulid(),
      ...data,
      createdAt: new Date().toISOString(),
    });
  }
}
