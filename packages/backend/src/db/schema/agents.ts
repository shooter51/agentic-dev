import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  model: text('model', { enum: ['opus', 'sonnet'] }).notNull(),
  status: text('status', {
    enum: ['idle', 'working', 'waiting', 'interrupted', 'paused', 'error'],
  }).notNull(),
  currentTask: text('current_task'),
  specialization: text('specialization'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
