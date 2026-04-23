import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import { agents } from './agents';
import { projects } from './projects';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id),
    title: text('title').notNull(),
    description: text('description'),
    stage: text('stage', {
      enum: [
        'todo',
        'product',
        'architecture',
        'development',
        'tech_lead_review',
        'devops_build',
        'manual_qa',
        'automation',
        'documentation',
        'devops_deploy',
        'arch_review',
        'done',
        'cancelled',
        'deferred',
      ],
    }).notNull(),
    priority: text('priority', { enum: ['P0', 'P1', 'P2', 'P3', 'P4'] }).notNull(),
    type: text('type', { enum: ['feature', 'bug', 'task', 'chore'] }).notNull(),
    assignedAgent: text('assigned_agent').references(() => agents.id),
    parentTaskId: text('parent_task_id').references((): ReturnType<typeof text> => tasks.id as any),
    beadsId: text('beads_id'),
    branchName: text('branch_name'),
    prUrl: text('pr_url'),
    metadata: text('metadata'), // JSON
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectStageIdx: index('idx_tasks_project_stage').on(table.projectId, table.stage),
    assignedAgentIdx: index('idx_tasks_assigned_agent').on(table.assignedAgent),
    parentTaskIdx: index('idx_tasks_parent_task').on(table.parentTaskId),
  }),
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
