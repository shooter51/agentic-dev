import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { tasks } from './tasks';

export const apiCalls = sqliteTable(
  'api_calls',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    taskId: text('task_id').references(() => tasks.id),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull(),
    status: text('status', { enum: ['success', 'error', 'rate_limited'] }).notNull(),
    errorCode: text('error_code'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    agentCreatedIdx: index('idx_api_calls_agent_created').on(table.agentId, table.createdAt),
    taskIdx: index('idx_api_calls_task').on(table.taskId),
  }),
);

export type ApiCall = typeof apiCalls.$inferSelect;
export type NewApiCall = typeof apiCalls.$inferInsert;
