import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    jti: text('jti').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    replacedBy: text('replaced_by'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    expIdx: index('refresh_tokens_exp_idx').on(t.expiresAt),
    replacedByIdx: index('refresh_tokens_replaced_idx').on(t.replacedBy),
  }),
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
