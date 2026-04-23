# LLD-002: Database Layer

**References:** ADR-0004

## Overview

SQLite database via Drizzle ORM with `better-sqlite3` driver. All schema defined as Drizzle table definitions, migrations managed via `drizzle-kit`.

## File Structure

```
packages/backend/src/
  db/
    index.ts              # Database connection and Drizzle instance
    schema/
      projects.ts         # Projects table
      tasks.ts            # Tasks table
      agents.ts           # Agents table
      memories.ts         # Memories table
      messages.ts         # Messages table
      handoffs.ts         # Handoffs table
      task-history.ts     # Task history table
      deliverables.ts     # Deliverables table
      api-calls.ts        # API call tracking table
      index.ts            # Re-exports all schemas
    seed.ts               # Agent seed data
    migrations/           # Generated migration files
  repositories/
    project.repository.ts
    task.repository.ts
    agent.repository.ts
    memory.repository.ts
    message.repository.ts
    handoff.repository.ts
    deliverable.repository.ts
    api-call.repository.ts
packages/backend/data/
  agentic-dev.db          # SQLite file (gitignored)
  deliverables/           # Large deliverable files
```

## Database Connection

```typescript
// db/index.ts

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DB_PATH = process.env.DB_PATH || 'data/agentic-dev.db';

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

## Schema Definitions

```typescript
// schema/projects.ts

import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  config: text('config'), // JSON — quality gate overrides, etc.
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
```

```typescript
// schema/tasks.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description'),
  stage: text('stage', {
    enum: ['todo', 'product', 'architecture', 'development',
           'tech_lead_review', 'devops_build', 'manual_qa',
           'automation', 'documentation', 'devops_deploy',
           'arch_review', 'done', 'cancelled', 'deferred']
  }).notNull(),
  priority: text('priority', { enum: ['P0', 'P1', 'P2', 'P3', 'P4'] }).notNull(),
  type: text('type', { enum: ['feature', 'bug', 'task', 'chore'] }).notNull(),
  assignedAgent: text('assigned_agent').references(() => agents.id),
  parentTaskId: text('parent_task_id').references(() => tasks.id),
  beadsId: text('beads_id'),
  branchName: text('branch_name'),
  prUrl: text('pr_url'),
  metadata: text('metadata'), // JSON
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  projectStageIdx: index('idx_tasks_project_stage').on(table.projectId, table.stage),
  assignedAgentIdx: index('idx_tasks_assigned_agent').on(table.assignedAgent),
  parentTaskIdx: index('idx_tasks_parent_task').on(table.parentTaskId),
}));

// schema/agents.ts

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  role: text('role').notNull(),
  model: text('model', { enum: ['opus', 'sonnet'] }).notNull(),
  status: text('status', {
    enum: ['idle', 'working', 'waiting', 'interrupted', 'paused', 'error']
  }).notNull(),
  currentTask: text('current_task').references(() => tasks.id),
  specialization: text('specialization'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// schema/memories.ts

export const memories = sqliteTable('memories', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
  projectId: text('project_id').references(() => projects.id),
  type: text('type', {
    enum: ['project', 'pattern', 'decision', 'teammate', 'feedback']
  }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  agentProjectIdx: index('idx_memories_agent_project').on(table.agentId, table.projectId),
}));

// schema/messages.ts

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  fromAgent: text('from_agent').notNull().references(() => agents.id),
  toAgent: text('to_agent').notNull().references(() => agents.id),
  type: text('type', {
    enum: ['clarification', 'notification', 'rejection', 'status_update']
  }).notNull(),
  content: text('content').notNull(),
  response: text('response'),
  status: text('status', { enum: ['pending', 'completed', 'expired'] }).notNull(),
  createdAt: text('created_at').notNull(),
  respondedAt: text('responded_at'),
}, (table) => ({
  taskStatusIdx: index('idx_messages_task_status').on(table.taskId, table.status),
  toAgentStatusIdx: index('idx_messages_to_agent_status').on(table.toAgent, table.status),
}));

// schema/api-calls.ts

export const apiCalls = sqliteTable('api_calls', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id),
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
}, (table) => ({
  agentCreatedIdx: index('idx_api_calls_agent_created').on(table.agentId, table.createdAt),
  taskIdx: index('idx_api_calls_task').on(table.taskId),
}));

// schema/handoffs.ts

export const handoffs = sqliteTable('handoffs', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  fromStage: text('from_stage').notNull(),
  toStage: text('to_stage').notNull(),
  fromAgent: text('from_agent').notNull().references(() => agents.id),
  content: text('content').notNull(), // markdown handoff document
  createdAt: text('created_at').notNull(),
}, (table) => ({
  taskIdx: index('idx_handoffs_task').on(table.taskId),
}));

// schema/task-history.ts

export const taskHistory = sqliteTable('task_history', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  event: text('event', {
    enum: ['stage_change', 'assignment', 'message', 'handoff', 'rejection', 'quality_gate']
  }).notNull(),
  fromValue: text('from_value'),
  toValue: text('to_value'),
  agentId: text('agent_id').references(() => agents.id),
  details: text('details'), // JSON
  createdAt: text('created_at').notNull(),
}, (table) => ({
  taskIdx: index('idx_task_history_task').on(table.taskId),
}));

// schema/deliverables.ts

export const deliverables = sqliteTable('deliverables', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id),
  stage: text('stage').notNull(),
  type: text('type', {
    enum: ['prd', 'adr', 'lld', 'test_report', 'coverage_report',
           'security_report', 'review_report', 'defect_report']
  }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  taskIdx: index('idx_deliverables_task').on(table.taskId),
}));
```

## Seed Data

```typescript
// seed.ts
// Note: better-sqlite3 is synchronous under the hood, so Drizzle calls
// resolve immediately. The `await` keyword is harmless but technically
// unnecessary — kept for consistency with the async function signature.

export async function seedAgents(db: DB): Promise<void> {
  const agentSeeds = [
    { id: 'product-manager', role: 'Product Manager', model: 'opus', status: 'idle' },
    { id: 'architect', role: 'Architect', model: 'opus', status: 'idle' },
    { id: 'tech-lead', role: 'Tech Lead', model: 'opus', status: 'idle' },
    { id: 'dev-1', role: 'Developer (Senior)', model: 'opus', status: 'idle' },
    { id: 'dev-2', role: 'Developer', model: 'sonnet', status: 'idle' },
    { id: 'dev-3', role: 'Developer', model: 'sonnet', status: 'idle' },
    { id: 'devops', role: 'DevOps Engineer', model: 'sonnet', status: 'idle' },
    { id: 'manual-qa', role: 'Manual QA', model: 'sonnet', status: 'idle' },
    { id: 'automation', role: 'QA Automation Engineer', model: 'sonnet', status: 'idle' },
    { id: 'documentation', role: 'Documentation Agent', model: 'sonnet', status: 'idle' },
  ];

  for (const agent of agentSeeds) {
    await db.insert(agents).values({
      ...agent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).onConflictDoNothing();
  }
}
```

## Repository Pattern

```typescript
// repositories/task.repository.ts

export class TaskRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Task | null> {
    return this.db.select().from(tasks).where(eq(tasks.id, id)).get();
  }

  async findByStage(projectId: string, stage: string): Promise<Task[]> {
    return this.db.select().from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.stage, stage)))
      .orderBy(asc(tasks.priority), asc(tasks.createdAt));
  }

  async findReadyForDispatch(): Promise<Task[]> {
    const childDefects = this.db.select({ id: tasks.id })
      .from(tasks)
      .where(and(
        eq(tasks.type, 'bug'),
        notInArray(tasks.stage, ['done', 'cancelled'])
      ));

    return this.db.select()
      .from(tasks)
      .where(and(
        notInArray(tasks.stage, ['todo', 'done', 'cancelled', 'deferred']),
        isNull(tasks.assignedAgent),
        notExists(
          this.db.select({ one: sql`1` })
            .from(childDefects.as('child_defects'))
            .where(sql`child_defects.parent_task_id = ${tasks.id}`)
        )
      ))
      .orderBy(
        asc(tasks.priority),
        desc(eq(tasks.type, 'bug')),
        asc(tasks.createdAt)
      );
  }

  async findChildDefects(parentTaskId: string): Promise<Task[]> {
    return this.db.select().from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), eq(tasks.type, 'bug')));
  }

  async findSubTasks(parentTaskId: string): Promise<Task[]> {
    return this.db.select().from(tasks)
      .where(and(
        eq(tasks.parentTaskId, parentTaskId),
        inArray(tasks.type, ['feature', 'task'])
      ));
  }

  async create(data: NewTask): Promise<Task> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(tasks).values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async updateStage(id: string, stage: string, agentId?: string): Promise<void> {
    await this.db.update(tasks)
      .set({ stage, assignedAgent: agentId ?? null, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id));
  }

  async getBoardView(projectId: string): Promise<Record<string, Task[]>> {
    const allTasks = await this.db.select().from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.priority), asc(tasks.createdAt));

    return groupBy(allTasks, 'stage');
  }
}
```

```typescript
// repositories/project.repository.ts

export class ProjectRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Project | null> {
    return this.db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
  }

  async findAll(): Promise<Project[]> {
    return this.db.select().from(projects).orderBy(asc(projects.name));
  }

  async create(data: NewProject): Promise<Project> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(projects).values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async update(id: string, data: Partial<Pick<Project, 'name' | 'path' | 'config'>>): Promise<Project> {
    await this.db.update(projects)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, id));
    return (await this.findById(id))!;
  }
}
```

## Migrations

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Drizzle config
# drizzle.config.ts in packages/backend/
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_PATH || 'data/agentic-dev.db',
  },
});
```
