# Architecture Overview

## System Design

Agentic Dev is a **central orchestrator** system that coordinates 10 AI agents through a 12-stage software development pipeline. The orchestrator owns all state, dispatches work, and enforces quality gates. Agents are stateless CLI subprocesses.

```
                          ┌──────────────┐
                          │   Dashboard  │
                          │  (React SPA) │
                          └──────┬───────┘
                                 │ HTTP + SSE
                          ┌──────┴───────┐
                          │  Fastify API │
                          │   + SSE Hub  │
                          └──────┬───────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                   │
       ┌──────┴──────┐   ┌──────┴──────┐    ┌──────┴──────┐
       │ Orchestrator │   │  Pipeline   │    │   Memory    │
       │  (dispatch,  │   │    FSM      │    │  Manager    │
       │   lifecycle) │   │  (guards)   │    │             │
       └──────┬──────┘   └─────────────┘    └─────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
  ┌─┴─┐   ┌──┴──┐   ┌──┴──┐
  │PM │   │Arch │   │Dev1 │  ...  (10 agents as CLI subprocesses)
  └───┘   └─────┘   └─────┘
```

## Core Components

### Orchestrator (`packages/backend/src/orchestrator/`)

The orchestrator runs a **dispatch loop** every second:

1. Query `findReadyForDispatch()` — tasks in active stages, unassigned, no blocking defects
2. For each task, find an idle agent in the matching lane via `findAvailableAgent(stage)`
3. Acquire a semaphore slot (max 4 concurrent agents)
4. Spawn the agent CLI subprocess
5. Stream stdout for tool calls and completion
6. On completion, auto-set quality gate metadata and advance the pipeline

Key files:
- `orchestrator.ts` — Main class: dispatch loop, agent lifecycle, error handling
- `cli-runner.ts` — Spawns Claude Code or OpenCode, parses stream-json events
- `agent-registry.ts` — 10 agent definitions with roles, models, lanes, practices
- `context-builder.ts` — Builds system/task prompts with handoffs, memories, CLAUDE.md
- `self-repair.ts` — Spawns Opus to diagnose code bugs after 5 failures
- `concurrency.ts` — Priority-aware semaphore for rate limiting
- `cost-tracker.ts` — Per-agent API cost tracking
- `loop-detector.ts` — Detects agents stuck in tool-call loops

### Pipeline FSM (`packages/backend/src/pipeline/`)

A finite state machine with 12 stages and quality guards at each transition.

```
todo -> product -> architecture -> development -> tech_lead_review ->
devops_build -> manual_qa -> automation -> documentation ->
devops_deploy -> arch_review -> done
```

Special flows:
- **Bug shortcut** — Bug-type tasks skip documentation and arch_review
- **Rejection** — Any review stage can send tasks backward (e.g., tech_lead_review -> development)
- **Force-move** — Operator can move tasks to any stage, bypassing guards

Quality guards check task metadata before allowing transitions:
- `product -> architecture`: PRD written, acceptance criteria defined
- `development -> tech_lead_review`: Unit coverage >= 80%, tests passing
- `devops_build -> manual_qa`: Build passed, no secrets detected
- etc.

Key files:
- `fsm.ts` — Pipeline class: advance, reject, forceMove, cancel, defer
- `transitions.ts` — Stage graph with guard references
- `guards.ts` — Guard implementations per stage
- `defect-flow.ts` — Bug/defect child task creation
- `stage-agent-map.ts` — Which agents handle which stages

### Agent Runner (`packages/backend/src/orchestrator/cli-runner.ts`)

Supports two CLI backends, selected via `AGENT_RUNNER` env var:

**Claude Code** (`claude`):
```
claude -p "prompt" --verbose --output-format stream-json \
  --model claude-opus-4-20250514 --max-turns 50 \
  --permission-mode bypassPermissions --system-prompt "..."
```

**OpenCode** (`opencode`):
```
opencode run --format json -m anthropic/claude-opus-4-20250514 "prompt"
```

The runner:
1. Builds system prompt (agent identity, practices, memories) and task prompt (description, handoffs)
2. Spawns the CLI as a child process
3. Parses JSON events from stdout (tool calls, text, results)
4. Emits SSE events for live UI updates
5. Detects completion from the `result` event
6. Returns `AgentResult` with summary and handoff content

### Database (`packages/backend/src/db/`)

SQLite via better-sqlite3 with Drizzle ORM. Schema:

| Table | Purpose |
|-------|---------|
| `projects` | Project definitions (name, path, config) |
| `tasks` | Task state (stage, priority, assignedAgent, metadata) |
| `task_history` | Audit log of stage changes, errors, quality gates |
| `agents` | Agent status, currentTask, lastError |
| `handoffs` | Structured handoff documents between stages |
| `memories` | Per-agent persistent memory (namespaced by project) |
| `messages` | Inter-agent communication queue |
| `api_calls` | API usage tracking for cost estimation |
| `deliverables` | Agent output artifacts |

### Memory System (`packages/backend/src/memory/`)

Each agent has namespaced memory scoped to a project. Memory types:
- **project** — Facts about the project
- **decision** — Architecture decisions, trade-offs
- **pattern** — Code patterns, conventions
- **teammate** — Notes about other agents' tendencies
- **feedback** — Corrections and preferences

Memories are injected into the system prompt when an agent starts work. A scoring system ranks memories by relevance and recency.

### Message Bus (`packages/backend/src/messaging/`)

Agents communicate via a SQLite-backed message queue. Message types:
- **clarification** — Questions between agents (blocking)
- **rejection** — Sending work back with reason

The orchestrator routes messages during each dispatch cycle and can interrupt working agents for urgent clarifications.

### SSE / Real-time (`packages/backend/src/sse/`)

Server-Sent Events broadcast to the dashboard:
- `agent-status` — Agent state changes (idle, working, error)
- `task-updated` — Task stage transitions
- `agent-tool-use` — Live tool call activity
- `agent-error` — Error notifications
- `self-repair-*` — Self-repair lifecycle events

### Frontend (`packages/frontend/src/`)

```
src/
  api/            # API client, TanStack Query hooks, types
  components/
    agents/       # AgentCard, AgentDetail, AgentPanel, MemoryViewer
    board/        # TaskCard, KanbanBoard, CreateTaskDialog, ProjectInfo
    common/       # AgentAvatar, PipelineProgress, MarkdownContent
    layout/       # Header, Sidebar
    task/         # TaskDetail, TaskHistory, HandoffViewer, TaskEditor
  hooks/          # useBoard (stage grouping), useSSE
  pages/          # BoardPage, StatsPage
  stores/         # Zustand UI store (selected task/agent, sidebar state)
  theme/          # Agent color tokens
```

Key patterns:
- TanStack Query with 3-second polling for board/agents
- SSE EventSource for live agent output
- Zustand for ephemeral UI state (no persistence needed)
- Radix UI primitives styled with Tailwind CSS v4

## Error Handling

### Classification
Errors are classified as **transient** or **permanent**:
- Transient: rate limits, timeouts, ECONNRESET, spawn ENOENT
- Permanent: type errors, import failures, test failures

### Recovery Strategy
1. **Retry with backoff** — Transient errors get exponential backoff (5s, 10s, 20s, ...)
2. **Agent failover** — After 2 failures, try a different agent in the same lane
3. **Self-repair** — After 5 failures with code-level errors, spawn Opus to diagnose and fix
4. **Watchdog** — Detects tasks assigned to idle agents (stale assignment) and clears them

### Self-Repair Flow
1. Error classifier confirms code-level errors (not transient)
2. System-wide lock acquired (one repair at a time)
3. Opus agent spawned with error history and project context
4. For target projects: auto-applies fix, verifies with typecheck
5. For agentic-dev itself: captures diff, reverts, requires operator approval

## Deployment

### Local Development
Two terminals: backend (`npx tsx src/index.ts` from `packages/backend`) and frontend (`npx vite` from `packages/frontend`). Frontend proxies `/api` to the backend.

### Docker
Single container serves both API and static frontend on one port. SQLite persisted via volume mount. Both Claude Code and OpenCode CLIs are pre-installed.

### Production Considerations
- Set `NODE_ENV=production` to enable static file serving from backend
- Volume-mount the data directory for SQLite persistence
- Agents need network access to call AI model APIs
- Git must be available for agents that interact with repositories

## Decision Records

See [docs/adr/](adr/) for the full set of Architecture Decision Records:

1. Monorepo Structure
2. Backend Framework (Fastify)
3. Agent Orchestration (Central Orchestrator)
4. Database (SQLite + Drizzle)
5. Inter-Agent Communication
6. Real-Time Updates (SSE)
7. Frontend Stack
8. Agent-to-Repo Interaction
9. Task Pipeline Engine (FSM)
10. Agent Memory Architecture
11. Error Handling and Retry

## Low-Level Designs

See [docs/lld/](lld/) for detailed designs:

1. Orchestrator Agent Lifecycle
2. Database Layer
3. Task Pipeline FSM
4. Inter-Agent Communication
5. Tool Execution Layer
6. Agent Memory System
7. REST API + SSE
8. Frontend Kanban UI
9. Help Widget
