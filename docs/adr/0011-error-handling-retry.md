# ADR-0011: Error Handling and Retry Strategy

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The system makes frequent API calls to the Anthropic service and executes tool calls (file I/O, shell commands, git operations) on behalf of agents. Failures are inevitable: API rate limits, network errors, tool execution failures, invalid agent output. We need a consistent strategy for handling these failures without losing work or creating inconsistent state.

## Decision

### Failure Categories

| Category | Examples | Strategy |
|----------|----------|----------|
| **Transient API errors** | 429 (rate limit), 500, 502, 503, network timeout | Retry with backoff |
| **Permanent API errors** | 400 (bad request), 401 (auth), 413 (too large) | Fail task, notify operator |
| **Tool execution failures** | Command exits non-zero, file not found, git conflict | Return error to agent as tool_result |
| **Invalid agent output** | No tool calls and no completion signal, malformed tool args | Retry with corrective prompt (max 3) |
| **Agent loop detection** | Agent makes the same tool call 5+ times with same args AND same results | Pause agent, notify operator |

### API Retry Strategy

```typescript
interface RetryConfig {
  maxRetries: 5;
  baseDelayMs: 1000;
  maxDelayMs: 60000;
  backoffMultiplier: 2;
  jitterFactor: 0.3;  // +-30% randomization
}
```

- **429 (rate limited):** Read `Retry-After` header if present. Otherwise, exponential backoff. Temporarily reduce the concurrency semaphore (ADR-0003) by 1.
- **500/502/503:** Exponential backoff with jitter. If 5 retries fail, pause the agent and notify the operator.
- **Network timeout:** Same as 5xx. The orchestrator sets a 120-second timeout per API call.
- **All retries are idempotent:** The same message payload is resent. No state changes occur between retries.

### Tool Execution Error Handling

Tool failures are **not retried by the orchestrator.** Instead, the error is returned to the agent as a `tool_result` with `is_error: true`. The agent decides how to proceed — it may retry with different arguments, try an alternative approach, or signal that it's stuck.

```typescript
// Tool execution wrapper
async function executeTool(call: ToolUse): Promise<ToolResult> {
  try {
    const result = await toolHandlers[call.name](call.input);
    return { tool_use_id: call.id, content: result };
  } catch (error) {
    return { tool_use_id: call.id, content: `Error: ${error.message}`, is_error: true };
  }
}
```

### Invalid Agent Output

If the agent returns a response with no tool calls and no explicit completion/handoff signal:

1. First occurrence: Resend with a corrective system message: "Your response did not include a tool call or completion signal. Please either use a tool to make progress or signal completion."
2. Second occurrence: Resend with stronger prompt: "You must use a tool or signal completion. Available tools: [list]."
3. Third occurrence: Pause the agent, set status to `error`, notify the operator via SSE.

### Agent Error State

Add `error` to agent lifecycle states (ADR-0003). An agent in `error` state:
- Has its current task marked as `blocked` (not failed — work may be recoverable).
- Emits an SSE `agent-error` event with the error details.
- Requires operator intervention to resume (via UI: "Retry" or "Reassign task").

### Cost Circuit Breaker

The orchestrator tracks cumulative API costs per task (via `api_calls` table, ADR-0004):
- **Per-task cost cap:** Configurable per project (default: $10). If a task exceeds this, the agent is paused and the operator is notified.
- **Per-hour cost cap:** Configurable (default: $50). If total system spend exceeds this in a rolling hour, all agents are paused.
- **Cost calculation:** Input tokens, output tokens, and cache tokens are priced per the Anthropic API pricing at the time of the call.

### Partial Work Preservation

When an agent fails mid-task:
1. All tool calls already executed are logged in `task_history`.
2. All files already written are on the feature branch (committed or uncommitted).
3. The conversation history summary is saved to SQLite.
4. On retry/resume, the agent receives this context: "You were working on [task]. You had completed: [summary of tool calls]. The task is at: [current state]. Continue from where you left off."

## Alternatives Considered

1. **Let agents handle their own retries** — Agents would include retry logic in their prompts. Rejected because it wastes tokens (the agent reasons about retries instead of the task) and creates inconsistent retry behavior across agents.

2. **Fail-fast with no retries** — Simpler but would cause constant operator intervention for transient issues. Rejected.

3. **Automatic task reassignment on failure** — When an agent fails, reassign to another agent of the same role. Rejected for v1 — adds complexity and the operator should understand why the failure occurred before reassigning.

## Consequences

- **Positive:** Transient failures are handled automatically. Work is never lost. Costs are bounded. The operator is notified only when intervention is truly needed.
- **Negative:** Retry delays can slow the pipeline. Mitigated by aggressive backoff that resolves most transient issues within 1-2 retries.
- **Risk:** Cost circuit breaker could pause work prematurely on expensive but legitimate tasks. Mitigated by making the cap configurable and showing cost accumulation in the UI so the operator can adjust.
