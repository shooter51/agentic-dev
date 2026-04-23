import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { projects } from './projects';

export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    projectId: text('project_id').references(() => projects.id),
    type: text('type', {
      enum: ['project', 'pattern', 'decision', 'teammate', 'feedback'],
    }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    agentProjectIdx: index('idx_memories_agent_project').on(table.agentId, table.projectId),
  }),
);

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
