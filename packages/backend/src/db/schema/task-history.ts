import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { tasks } from './tasks';

export const taskHistory = sqliteTable(
  'task_history',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    event: text('event', {
      enum: ['stage_change', 'assignment', 'message', 'handoff', 'rejection', 'quality_gate', 'self_repair', 'agent_error'],
    }).notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    agentId: text('agent_id').references(() => agents.id),
    details: text('details'), // JSON
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdx: index('idx_task_history_task').on(table.taskId),
  }),
);

export type TaskHistory = typeof taskHistory.$inferSelect;
export type NewTaskHistory = typeof taskHistory.$inferInsert;
