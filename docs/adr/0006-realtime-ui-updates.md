# ADR-0006: Real-Time UI Updates — Server-Sent Events (SSE)

**Status:** Accepted
**Date:** 2026-04-22
**Deciders:** Operator, Architect

## Context

The Kanban UI needs real-time updates for task movements, agent status changes, inter-agent messages, and handoff notifications. The UI is operated by a single user. Client-to-server communication is handled via REST API calls (creating tasks, sending operator messages, etc.).

## Decision

Use **Server-Sent Events (SSE)** for all server-to-client push notifications.

### Implementation

Single SSE endpoint: `GET /api/events`

The backend maintains an SSE connection and pushes named events:

```
event: task-updated
data: {"taskId":"01J...","stage":"development","assignedAgent":"dev-1"}

event: agent-status
data: {"agentId":"architect","status":"working","currentTask":"01J..."}

event: new-message
data: {"messageId":"01J...","from":"architect","to":"product-manager","type":"clarification"}

event: handoff
data: {"taskId":"01J...","fromStage":"architecture","toStage":"development"}

event: quality-gate
data: {"taskId":"01J...","gate":"unit-coverage","result":"pass","value":"98.5%"}
```

### Frontend

Use the browser's native `EventSource` API with a thin React hook:

```typescript
function useSSE(url: string) {
  // Connects, auto-reconnects on failure
  // Invalidates TanStack Query caches per the SSE-to-Query contract (see below)
  // Updates Zustand store for non-server-state UI changes (e.g., toast notifications)
}
```

### Event Types

| Event | Trigger | Data |
|-------|---------|------|
| `task-updated` | Task stage change, assignment, priority change | Task snapshot |
| `agent-status` | Agent idle/working/waiting/paused | Agent snapshot |
| `new-message` | Agent sends a message | Message object |
| `message-response` | Agent responds to a message | Message with response |
| `handoff` | Stage transition with handoff doc | Handoff summary |
| `quality-gate` | Quality gate check result | Gate name + result |
| `defect-created` | QA creates a defect | Defect task summary |

### Catch-Up on Reconnect

Every SSE event includes a monotonically increasing `id` field (ULID). The backend maintains a **ring buffer of the last 500 events** in memory. On reconnect:

1. The `EventSource` API sends `Last-Event-ID` automatically.
2. The backend replays all buffered events after that ID.
3. If the requested ID is older than the buffer (e.g., after a long disconnect or server restart), the backend sends a special `full-sync` event telling the client to refetch all state via REST.

On server restart, the ring buffer is empty. The first client connection after restart receives a `full-sync` event.

### Keepalive

The backend sends a `:keepalive` comment every 30 seconds to prevent connection timeout, especially relevant for SSH tunnels and proxies. This is a standard SSE comment (prefixed with `:`) that `EventSource` ignores but keeps the TCP connection alive.

### Event Payload Strategy

- **Task and agent events** send the full current snapshot (not deltas). Payloads are small (< 1KB per event) and snapshots are idempotent — if events arrive out of order or are replayed, the client always converges to the correct state.
- **Message events** send the message object. The UI appends to its local list.

### SSE-to-TanStack Query Contract

SSE event names map directly to TanStack Query cache invalidation:

| SSE Event | TanStack Query Key Invalidated |
|-----------|-------------------------------|
| `task-updated` | `['tasks', taskId]`, `['tasks', 'board', projectId]` |
| `agent-status` | `['agents']`, `['agents', agentId]` |
| `new-message` | `['messages', taskId]` |
| `message-response` | `['messages', taskId]` |
| `handoff` | `['tasks', taskId]`, `['handoffs', taskId]` |
| `quality-gate` | `['tasks', taskId]` |
| `defect-created` | `['tasks', 'board', projectId]` |

This contract must be maintained — if event names or query keys change in one place, they must change in both.

## Alternatives Considered

1. **WebSocket** — Bidirectional, low-latency. Overkill for this use case — we only need server-to-client push. Adds upgrade handshake complexity, ping/keepalive management, and a `ws` library dependency. Rejected.

2. **Polling** — Simplest to implement. Adds latency (poll interval) and unnecessary load. Rejected.

## Consequences

- **Positive:** Zero dependencies — native `res.write()` with `text/event-stream`. Automatic reconnection via `EventSource` API. Named events map cleanly to update categories. Works over HTTP/2 with multiplexing.
- **Negative:** SSE is unidirectional — client-to-server must use REST. This matches our architecture (REST for commands, SSE for events).
- **Risk:** SSE connection can drop on network issues. Mitigated by `EventSource` auto-reconnect and a `lastEventId` mechanism for catching up on missed events.
