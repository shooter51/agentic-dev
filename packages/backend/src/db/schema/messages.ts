import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { tasks } from './tasks';

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    fromAgent: text('from_agent')
      .notNull()
      .references(() => agents.id),
    toAgent: text('to_agent')
      .notNull()
      .references(() => agents.id),
    type: text('type', {
      enum: ['clarification', 'notification', 'rejection', 'status_update'],
    }).notNull(),
    content: text('content').notNull(),
    response: text('response'),
    status: text('status', { enum: ['pending', 'completed', 'expired'] }).notNull(),
    createdAt: text('created_at').notNull(),
    respondedAt: text('responded_at'),
  },
  (table) => ({
    taskStatusIdx: index('idx_messages_task_status').on(table.taskId, table.status),
    toAgentStatusIdx: index('idx_messages_to_agent_status').on(table.toAgent, table.status),
  }),
);

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
