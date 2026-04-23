# ADR-0005: Inter-Agent Communication — SQLite Message Queue with EventEmitter

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

Agents need two communication modes:
1. **Async handoffs** — Structured documents passed between pipeline stages.
2. **Direct messaging** — Blocking requests where the sender waits for a response (e.g., Architect asks Product Manager for clarification).

The blocking requirement means we need a synchronization mechanism within the single-process orchestrator.

## Decision

### Message Queue in SQLite

All messages are stored in the `messages` table (see ADR-0004). The flow:

1. **Sender** inserts a row with `status: pending` and returns a `Promise`.
2. **Orchestrator** detects the pending message and routes it to the recipient agent.
3. **Recipient** processes the message and writes a response, setting `status: completed`.
4. **Sender's** Promise resolves with the response.

### Signaling via Node.js EventEmitter

A central `MessageBus` EventEmitter coordinates blocking:

```typescript
// Sender side
async function sendMessage(from: string, to: string, taskId: string, content: string): Promise<string> {
  const messageId = createMessage({ from, to, taskId, content, status: 'pending' });
  messageBus.emit('message:new', { messageId, to });
  return new Promise((resolve) => {
    messageBus.once(`message:response:${messageId}`, (response: string) => {
      resolve(response);
    });
  });
}

// Recipient side (orchestrator routes to recipient agent)
// After recipient processes and responds:
function respondToMessage(messageId: string, response: string) {
  updateMessage(messageId, { response, status: 'completed', respondedAt: now() });
  messageBus.emit(`message:response:${messageId}`, response);
}
```

### Blocking Behavior

When a sender agent sends a `clarification` message:
1. The sender's status changes to `waiting`.
2. The orchestrator pauses the sender's run loop.
3. The orchestrator delivers the message to the recipient using the **interrupt strategy** (see below).
4. When the recipient responds, the sender's Promise resolves and their run loop resumes.

### Interrupt vs Queue Strategy

When a message arrives for a busy agent, the orchestrator uses **priority-based interruption:**

- **`clarification` messages:** Interrupt the recipient. The recipient's current work is saved (see ADR-0003 "Interrupted State"), the message is processed in a short API call, and the recipient resumes their original task. Rationale: the sender is blocked and waiting.
- **`notification` messages:** Queued. Delivered when the recipient finishes their current task or reaches a natural break point (between tool calls). Rationale: no one is waiting.
- **`rejection` messages:** Interrupt the recipient. Rejections indicate the recipient's current work may be based on flawed input. Rationale: continuing wastes tokens.
- **`status_update` messages:** Queued. Informational only.

### Timeout

Blocking messages have a configurable timeout (default: 10 minutes). On timeout:
1. The EventEmitter listener for that message ID is explicitly cleaned up (prevents memory leaks).
2. The message status is set to `expired` in SQLite.
3. The sender is notified to proceed with best judgment or escalate to the operator.
4. An SSE event is emitted so the UI highlights the expired message.

### Message Priority

Messages are processed in priority order when multiple are queued:

1. `rejection` — Highest (stop wasted work)
2. `clarification` — High (unblock a waiting agent)
3. `notification` — Normal
4. `status_update` — Low

### Restart Recovery

On process restart, the orchestrator performs a recovery sweep:
1. Scan `messages` table for `status = 'pending'`.
2. For each pending message, check if the sender's task is still active.
3. If active: re-dispatch the message to the recipient and re-create the sender's blocking state by resuming their task with context "you were waiting for a response to [message content]."
4. If the sender's task is no longer active: mark the message as `expired`.

### Deadlock Detection

The orchestrator maintains a wait-for graph. On every new blocking message:
1. Add edge: sender → recipient.
2. Run DFS cycle detection on the graph.
3. If a cycle is detected: mark the newest message in the cycle as `expired`, notify the sender to proceed with best judgment, emit an SSE alert to the operator, and log the deadlock for analysis.

### Handoffs

Handoffs are a special case — they are stored in the `handoffs` table and trigger a pipeline stage transition. They are not blocking; the sender completes its stage and the orchestrator advances the task.

## Alternatives Considered

1. **Redis pub/sub** — Adds an external dependency for a single-process system. Rejected.
2. **Direct function calls between agents** — No persistence, no auditability, breaks if process restarts mid-conversation. Rejected.
3. **Polling loop on SQLite** — Simpler but adds latency. EventEmitter provides instant notification. Rejected as primary mechanism (used as fallback on restart).

## Consequences

- **Positive:** Every message is persisted and queryable. Survives restarts (pending messages are retried). Full audit trail visible in UI. EventEmitter provides near-instant signaling.
- **Negative:** EventEmitter is in-memory — on restart, must scan for pending messages and re-emit. Mitigated by a startup recovery sweep.
- **Risk:** Deadlock if Agent A waits on Agent B who waits on Agent A. Mitigated by the orchestrator detecting circular waits and escalating to the operator.
