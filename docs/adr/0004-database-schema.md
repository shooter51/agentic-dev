# ADR-0004: Database — SQLite with Drizzle ORM

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The system needs persistent storage for tasks, agent state, memories, messages, handoffs, and configuration. The system runs locally on the operator's machine with no cloud dependencies.

## Decision

Use **SQLite** via **Drizzle ORM** with `better-sqlite3` driver. Single database file stored at `packages/backend/data/agentic-dev.db`.

### Core Tables

```
projects
  id            TEXT PRIMARY KEY (ULID)
  name          TEXT NOT NULL
  path          TEXT NOT NULL (absolute path to target repo)
  config        TEXT (JSON — quality gate overrides, etc.)
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

tasks
  id            TEXT PRIMARY KEY (ULID)
  project_id    TEXT NOT NULL FK(projects)
  title         TEXT NOT NULL
  description   TEXT
  stage         TEXT NOT NULL (todo|product|architecture|development|tech_lead_review|devops_build|manual_qa|automation|documentation|devops_deploy|arch_review|done|cancelled|deferred)
  priority      TEXT NOT NULL (P0|P1|P2|P3|P4)
  type          TEXT NOT NULL (feature|bug|task|chore)
  assigned_agent TEXT FK(agents)
  parent_task_id TEXT FK(tasks) — for defect linking
  beads_id      TEXT — Beads issue ID
  branch_name   TEXT
  pr_url        TEXT
  metadata      TEXT (JSON — coverage numbers, test results, etc.)
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

agents
  id            TEXT PRIMARY KEY (e.g., product-manager, architect, dev-1)
  role          TEXT NOT NULL
  model         TEXT NOT NULL (opus|sonnet)
  status        TEXT NOT NULL (idle|working|waiting|interrupted|paused|error)
  current_task  TEXT FK(tasks)
  specialization TEXT — for developers
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

memories
  id            TEXT PRIMARY KEY (ULID)
  agent_id      TEXT NOT NULL FK(agents)
  project_id    TEXT FK(projects) — NULL for global memories
  type          TEXT NOT NULL (project|pattern|decision|teammate|feedback)
  title         TEXT NOT NULL
  content       TEXT NOT NULL
  created_at    TEXT NOT NULL
  updated_at    TEXT NOT NULL

messages
  id            TEXT PRIMARY KEY (ULID)
  task_id       TEXT NOT NULL FK(tasks)
  from_agent    TEXT NOT NULL FK(agents)
  to_agent      TEXT NOT NULL FK(agents)
  type          TEXT NOT NULL (clarification|notification|rejection|status_update)
  content       TEXT NOT NULL
  response      TEXT — filled when recipient responds
  status        TEXT NOT NULL (pending|completed|expired)
  created_at    TEXT NOT NULL
  responded_at  TEXT

handoffs
  id            TEXT PRIMARY KEY (ULID)
  task_id       TEXT NOT NULL FK(tasks)
  from_stage    TEXT NOT NULL
  to_stage      TEXT NOT NULL
  from_agent    TEXT NOT NULL FK(agents)
  content       TEXT NOT NULL (markdown handoff document)
  created_at    TEXT NOT NULL

task_history
  id            TEXT PRIMARY KEY (ULID)
  task_id       TEXT NOT NULL FK(tasks)
  event         TEXT NOT NULL (stage_change|assignment|message|handoff|rejection|quality_gate)
  from_value    TEXT
  to_value      TEXT
  agent_id      TEXT FK(agents)
  details       TEXT (JSON)
  created_at    TEXT NOT NULL

deliverables
  id            TEXT PRIMARY KEY (ULID)
  task_id       TEXT NOT NULL FK(tasks)
  stage         TEXT NOT NULL
  type          TEXT NOT NULL (prd|adr|lld|test_report|coverage_report|security_report|review_report|defect_report)
  title         TEXT NOT NULL
  content       TEXT NOT NULL
  created_at    TEXT NOT NULL

api_calls
  id            TEXT PRIMARY KEY (ULID)
  agent_id      TEXT NOT NULL FK(agents)
  task_id       TEXT FK(tasks)
  model         TEXT NOT NULL (claude-opus-4-6|claude-sonnet-4-6)
  input_tokens  INTEGER NOT NULL
  output_tokens INTEGER NOT NULL
  cache_read_tokens INTEGER NOT NULL DEFAULT 0
  cache_write_tokens INTEGER NOT NULL DEFAULT 0
  latency_ms    INTEGER NOT NULL
  status        TEXT NOT NULL (success|error|rate_limited)
  error_code    TEXT — HTTP status or error type on failure
  created_at    TEXT NOT NULL
```

### Additional Table Notes

- **`tasks.parent_task_id`** serves two purposes, distinguished by `tasks.type`: when `type = 'bug'`, it links a defect to its source task; when `type = 'feature'` or `'task'`, it links a sub-task to its parent for parallel development. The relationship type is always unambiguous from the task type.
- **`tasks.stage`** includes `cancelled` and `deferred` as valid values for tasks that are closed without completion.
- **`agents` table** is seeded on startup with the 10 fixed agent configurations. Agents are not dynamically created or removed — the table provides mutable state (status, current_task, specialization) for static identities.
- **Large deliverables** (coverage reports, large test outputs) may be stored as files on disk at `packages/backend/data/deliverables/<task_id>/` with the `content` column holding the file path instead. The `type` column determines interpretation.

### Indexes

- `tasks(project_id, stage)` — Kanban board queries
- `tasks(assigned_agent)` — Agent workload queries
- `tasks(parent_task_id)` — Defect-to-parent lookups
- `memories(agent_id, project_id)` — Agent memory retrieval
- `messages(task_id, status)` — Pending message polling
- `messages(to_agent, status)` — Agent inbox queries
- `task_history(task_id)` — Task timeline
- `handoffs(task_id)` — Handoff chain
- `deliverables(task_id)` — Task artifacts
- `api_calls(agent_id, created_at)` — Agent API usage tracking
- `api_calls(task_id)` — Per-task cost analysis

## Alternatives Considered

1. **PostgreSQL** — More powerful querying, better concurrency, JSONB support. Rejected because it requires running a server, adds operational overhead, and is unnecessary for a single-operator local system.

2. **File-based markdown (like Claude memory)** — Simple and inspectable. Rejected because it doesn't support efficient querying, indexing, or transactional updates needed for task state management and inter-agent messaging.

## Consequences

- **Positive:** Zero config, no server, single file for backup/restore, excellent read performance, Drizzle provides type-safe queries.
- **Negative:** SQLite has limited concurrent write throughput (single writer lock). Mitigated by the central orchestrator serializing writes.
- **Risk:** Database file corruption on power loss. Mitigated by enabling WAL mode and running periodic backups.
