import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const authAuditLog = sqliteTable(
  'auth_audit_log',
  {
    id: text('id').primaryKey(),
    event: text('event', {
      enum: [
        'login_success',
        'login_failure',
        'refresh',
        'refresh_reuse_detected',
        'logout',
        'token_rejected',
      ],
    }).notNull(),
    userId: text('user_id'),
    emailHash: text('email_hash'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    details: text('details'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    userCreatedIdx: index('auth_audit_user_created_idx').on(t.userId, t.createdAt),
    eventCreatedIdx: index('auth_audit_event_created_idx').on(t.event, t.createdAt),
  }),
);

export type AuthAuditRow = typeof authAuditLog.$inferSelect;
export type NewAuthAuditRow = typeof authAuditLog.$inferInsert;
