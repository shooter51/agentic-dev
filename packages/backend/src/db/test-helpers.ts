/**
 * Test helper for creating in-memory SQLite databases with the full schema.
 * Used by repository tests to avoid touching the real database.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';

export type TestDB = ReturnType<typeof drizzle<typeof schema>>;

export function createTestDb(): TestDB {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');

  // Create all tables in dependency order
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      config TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      current_task TEXT,
      specialization TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT,
      stage TEXT NOT NULL,
      priority TEXT NOT NULL,
      type TEXT NOT NULL,
      assigned_agent TEXT REFERENCES agents(id),
      parent_task_id TEXT REFERENCES tasks(id),
      beads_id TEXT,
      branch_name TEXT,
      pr_url TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      project_id TEXT REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      from_agent TEXT NOT NULL REFERENCES agents(id),
      to_agent TEXT NOT NULL REFERENCES agents(id),
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      response TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      responded_at TEXT
    );

    CREATE TABLE IF NOT EXISTS handoffs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      from_stage TEXT NOT NULL,
      to_stage TEXT NOT NULL,
      from_agent TEXT NOT NULL REFERENCES agents(id),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      event TEXT NOT NULL,
      from_value TEXT,
      to_value TEXT,
      agent_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deliverables (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      stage TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_calls (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      task_id TEXT REFERENCES tasks(id),
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      roles TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      jti TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      replaced_by TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS refresh_tokens_exp_idx ON refresh_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS refresh_tokens_replaced_idx ON refresh_tokens(replaced_by);

    CREATE TABLE IF NOT EXISTS auth_audit_log (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      user_id TEXT,
      email_hash TEXT,
      ip TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_audit_user_created_idx ON auth_audit_log(user_id, created_at);
    CREATE INDEX IF NOT EXISTS auth_audit_event_created_idx ON auth_audit_log(event, created_at);
  `);

  return drizzle(sqlite, { schema });
}

/**
 * Seed a project and agent for use in tests that need foreign key references.
 */
export async function seedBasicEntities(db: TestDB) {
  const now = new Date().toISOString();

  await db.insert(schema.projects).values({
    id: 'proj-1',
    name: 'Test Project',
    path: '/repo',
    config: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.agents).values({
    id: 'agent-1',
    role: 'Developer',
    model: 'sonnet',
    status: 'idle',
    currentTask: null,
    specialization: null,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.agents).values({
    id: 'agent-2',
    role: 'Tech Lead',
    model: 'opus',
    status: 'idle',
    currentTask: null,
    specialization: null,
    createdAt: now,
    updatedAt: now,
  });

  return { projectId: 'proj-1', agentId: 'agent-1', agentId2: 'agent-2' };
}
