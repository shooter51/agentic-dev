# ADR-0010: Agent Memory Architecture — Namespaced SQLite with Access Control

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

Each of the 10 agents needs persistent memory that survives across tasks and sessions. Agents need to remember project conventions, past decisions, teammate specializations, and operator feedback. Memory must be isolated (agents can't modify each other's) but selectively shareable (agents can read shared project knowledge).

## Decision

### Storage

All agent memories are stored in the `memories` table (see ADR-0004), namespaced by `agent_id` and optionally `project_id`.

### Memory Types

| Type | Scope | Description | Example |
|------|-------|-------------|---------|
| `project` | Per-project | Knowledge about a target project's stack, patterns, conventions | "gradeSnap uses Drizzle ORM with Postgres" |
| `pattern` | Per-project | Learned coding patterns and file conventions | "This repo uses barrel exports in index.ts" |
| `decision` | Per-project | Past architectural or design decisions | "We chose SQLite over Postgres for memory" |
| `teammate` | Global | Knowledge about other agents' strengths and tendencies | "Dev-2 specializes in React frontend" |
| `feedback` | Global | Corrections or preferences from the operator | "Operator prefers smaller PRs" |

### Access Control

```typescript
interface MemoryAccess {
  create: 'own';         // Agents can only create memories in their own namespace
  read: 'own' | 'shared'; // Agents can read their own + shared project memories
  update: 'own';         // Agents can only update their own memories
  delete: 'own';         // Agents can only delete their own memories
}
```

- **Own memories:** Full CRUD. Only the owning agent can modify.
- **Shared project memories:** Read-only access to other agents' `project` and `decision` type memories for the same project. This allows the Architect's decisions to inform Developer behavior without the Developer modifying Architect's memories.
- **Operator override:** The operator can view, edit, and delete any agent's memories through the UI.

### Memory Injection

When an agent starts work on a task, the orchestrator injects relevant memories into the system prompt:

1. Agent's global memories (`teammate`, `feedback` types)
2. Agent's project-specific memories for the target project
3. Shared project memories from other agents (read-only, labeled with source agent)

### Memory Lifecycle

- **Creation:** Agents create memories during task processing when they learn something worth persisting.
- **Staleness:** Memories include an `updated_at` timestamp. When an agent encounters information that contradicts a memory, it updates or deletes it.
- **Relevance scoring:** When injecting memories into prompts, the orchestrator scores each memory using a weighted formula:

  ```
  score = (project_weight * project_match)
        + (type_weight * type_priority)
        + (recency_weight * recency_score)

  where:
    project_match:  1.0 if exact project, 0.5 if global, 0.0 if different project
    type_priority:  feedback=1.0, decision=0.8, project=0.6, pattern=0.4, teammate=0.2
    recency_score:  1.0 if updated in last 24h, decays linearly to 0.1 over 90 days

  weights:
    project_weight = 0.4
    type_weight    = 0.35
    recency_weight = 0.25
  ```

  Memories are sorted by score descending. The orchestrator injects memories top-down until the 8,000-token budget is exhausted.

### Memory Size Limits

- Individual memory content: max 2,000 tokens
- Total memories injected per prompt: max 8,000 tokens
- If an agent exceeds 100 memories, the orchestrator prompts it to consolidate or prune stale entries.

### Agent Self-Awareness

Each agent's system prompt includes a static "identity" block describing its role, lane, practices, and tools. This is not stored in the memory table — it's a fixed configuration:

```typescript
interface AgentIdentity {
  id: string;
  role: string;
  lane: string;
  model: string;
  practices: string[];   // From recommended-practices.md
  allowedTools: string[];
  systemPrompt: string;  // Role-specific instructions
}
```

### Memory Tools Integration

Memory CRUD operations are exposed as agent tools (see ADR-0008 tool table):
- `create_memory` — Agent creates a memory in its own namespace.
- `read_memories` — Agent reads its own memories + shared project memories.
- `update_memory` — Agent updates a memory it owns.
- `delete_memory` — Agent deletes a memory it owns.

These are explicit tool calls — the agent decides when to create, update, or prune memories during task processing. The orchestrator enforces namespace isolation (an agent cannot modify another agent's memories via tool calls).

### Stale Cross-Agent Memory Handling

`teammate` type memories (e.g., "Dev-2 specializes in React") can go stale when agent configurations change. Mitigations:
- When the operator modifies an agent's `specialization` field via the UI, the orchestrator broadcasts a `notification` message to all agents: "Dev-2's specialization changed from [old] to [new]."
- Agents receiving this notification update or delete their relevant `teammate` memories.
- The Architect agent, which assigns developers, always checks the `agents` table for current specializations rather than relying solely on memory.

## Alternatives Considered

1. **Separate SQLite database per agent** — Stronger isolation but makes shared reading complex and backup/restore harder. Rejected.

2. **File-based markdown memories** — Human-readable and inspectable. Rejected because it doesn't support efficient querying, relevance scoring, or transactional updates at the scale of 10 agents x multiple projects.

3. **Vector database for semantic search** — Enables similarity-based memory retrieval. Adds a dependency (e.g., ChromaDB) and complexity. Rejected for v1 — keyword and type-based retrieval is sufficient. Can add semantic search later.

## Consequences

- **Positive:** Persistent across restarts. Isolated by agent. Shared project knowledge prevents duplicate learning. Operator has full visibility and control. Token budget prevents prompt bloat.
- **Negative:** Keyword-based relevance scoring may miss semantically relevant memories. Mitigated by clear memory types and agent-driven pruning.
- **Risk:** Agents may create too many memories, degrading prompt quality. Mitigated by the 100-memory cap with consolidation prompts and the 8,000-token injection budget.
