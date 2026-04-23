import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  config: text('config'), // JSON — quality gate overrides, etc.
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
