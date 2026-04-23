# ADR-0003: Agent Orchestration — Central Orchestrator with Per-Task Conversations

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The system manages 10 AI agents, each with a specific role. We need to decide:
1. How agents are spawned and managed (lifecycle)
2. Whether agents run as separate OS processes or within a single process
3. Whether coordination is centralized or peer-to-peer
4. Whether agents maintain long-running conversations or create new ones per task

## Decision

### Central Orchestrator

A single orchestrator process owns the task pipeline, assigns tasks to agents, routes inter-agent messages, and controls stage transitions. Each agent runs as an **async function** within the orchestrator process — not as separate OS processes.

### Per-Task Conversations

Agents use the Anthropic SDK's `messages.create()` per task, not long-running conversations. Agent state (role, current task, conversation history summary, memories) is stored in SQLite and rehydrated as the system prompt for each API call.

### Agent Lifecycle

- **Idle:** Agent has no assigned task. Waiting for orchestrator to dispatch.
- **Working:** Agent is actively processing a task via API calls.
- **Waiting:** Agent sent a blocking message to another agent and is awaiting response.
- **Paused:** Operator manually paused the agent via UI.

"Pause" means persisting current state to SQLite and stopping the agent's run loop. "Resume" means rehydrating from DB and creating a new API call with accumulated context.

### Agent Run Loop

```
1. Orchestrator checks for ready tasks (task in agent's lane, not blocked)
2. Orchestrator dispatches task to agent with context (handoff, project CLAUDE.md, memories)
3. Agent calls Anthropic API with system prompt (role + practices + context)
4. Agent receives response — may include tool_use blocks
5. Orchestrator validates and executes tool calls via sandboxed execution layer (see ADR-0008)
6. Loop continues until agent signals task completion or handoff
7. Orchestrator transitions task to next pipeline stage
```

### Concurrent Repo Access

When multiple developers work on sub-tasks of the same feature in the same repo:

1. **Branch-per-task:** Every task gets its own branch (`agentic/<task-id>/<description>`). Sub-tasks get their own branches off the parent feature branch. This is enforced by the orchestrator — no two agents write to the same branch simultaneously.
2. **Working directory isolation:** Each agent operation locks a mutex on the target repo directory. File writes and git operations are serialized per-repo to prevent race conditions.
3. **Merge conflicts:** When sub-tasks converge, the orchestrator merges sub-task branches into the parent feature branch sequentially. If a merge conflict occurs, the task is sent back to the conflicting developer with the conflict details.

### Concurrency Control

- **Max concurrent API calls:** Configurable semaphore (default: 4). Agents queue when the limit is reached. Priority order: defect tasks > pipeline-blocking tasks > standard tasks.
- **Rate limit handling:** On 429 responses, the orchestrator applies exponential backoff with jitter per-agent and reduces the concurrency semaphore temporarily.
- **One task per agent:** An agent works on exactly one task at a time. If all agents in a lane are busy, new tasks wait in the queue.

### Context Window Budget

The system prompt for each API call is assembled from a fixed token budget:

| Component | Max Tokens | Priority |
|-----------|-----------|----------|
| Agent identity (role, lane, practices) | 3,000 | Required |
| Tool definitions | 2,000 | Required |
| Project CLAUDE.md | 2,000 | Required |
| Handoff document | 4,000 | Required |
| Agent memories (see ADR-0010) | 8,000 | Scored by relevance |
| Conversation history summary | 4,000 | Most recent first |
| **Total system prompt budget** | **~23,000** | — |

This leaves the majority of the context window (Opus: 200K, Sonnet: 200K) for task work, tool results, and multi-turn reasoning.

### Interrupted State

When the orchestrator must deliver a blocking message to a busy agent:

- Agent status transitions to `interrupted`.
- The current API call's conversation state is saved to SQLite.
- The agent processes the incoming message (a new, short API call).
- After responding, the agent resumes its original task by rehydrating the saved conversation state.

Agent lifecycle states (updated):
- **Idle:** No assigned task.
- **Working:** Actively processing a task.
- **Waiting:** Sent a blocking message, awaiting response.
- **Interrupted:** Paused current work to handle an incoming message.
- **Paused:** Operator manually paused via UI.

## Alternatives Considered

1. **Separate OS processes per agent** — Better isolation but adds IPC complexity, resource overhead, and makes inter-agent messaging harder. Rejected because we're bottlenecked on API latency, not compute.

2. **Long-running conversations** — Keep a persistent conversation thread per agent. Rejected because conversations hit context limits, can't be serialized mid-stream, and accumulate stale context. Per-task conversations with memory rehydration are cheaper, more predictable, and survive restarts.

3. **Peer-to-peer coordination** — Agents communicate directly without a central orchestrator. Rejected due to deadlock risk (circular blocking messages between 10 agents), loss of pipeline enforcement, and poor observability.

## Consequences

- **Positive:** Single process simplifies deployment, logging, and debugging. Central orchestrator prevents deadlocks, enforces pipeline order, and manages API rate limits. Per-task conversations keep context fresh and costs predictable.
- **Negative:** Single-machine limitation. If the process crashes, all agents stop. Mitigated by persisting all state in SQLite — full recovery on restart.
- **Risk:** API rate limits with 10 concurrent agents. Mitigated by orchestrator-level concurrency control (max N concurrent API calls).
