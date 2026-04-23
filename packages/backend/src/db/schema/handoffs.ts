import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { tasks } from './tasks';

export const handoffs = sqliteTable(
  'handoffs',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    fromStage: text('from_stage').notNull(),
    toStage: text('to_stage').notNull(),
    fromAgent: text('from_agent')
      .notNull()
      .references(() => agents.id),
    content: text('content').notNull(), // markdown handoff document
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdx: index('idx_handoffs_task').on(table.taskId),
  }),
);

export type Handoff = typeof handoffs.$inferSelect;
export type NewHandoff = typeof handoffs.$inferInsert;
