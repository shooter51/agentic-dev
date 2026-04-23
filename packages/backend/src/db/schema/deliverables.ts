import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { tasks } from './tasks';

export const deliverables = sqliteTable(
  'deliverables',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    stage: text('stage').notNull(),
    type: text('type', {
      enum: [
        'prd',
        'adr',
        'lld',
        'test_report',
        'coverage_report',
        'security_report',
        'review_report',
        'defect_report',
      ],
    }).notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    taskIdx: index('idx_deliverables_task').on(table.taskId),
  }),
);

export type Deliverable = typeof deliverables.$inferSelect;
export type NewDeliverable = typeof deliverables.$inferInsert;
