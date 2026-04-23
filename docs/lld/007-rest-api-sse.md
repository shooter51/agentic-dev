# LLD-007: REST API & SSE

**References:** ADR-0002, ADR-0006

## Overview

Fastify REST API serves the React frontend. SSE endpoint pushes real-time updates. All routes are organized by domain as Fastify plugins.

## File Structure

```
packages/backend/src/
  routes/
    index.ts               # Route registration
    projects.ts            # Project CRUD
    tasks.ts               # Task CRUD + board view
    agents.ts              # Agent status and control
    messages.ts            # Message history and operator messaging
    memories.ts            # Memory viewer (operator)
    deliverables.ts        # Deliverable retrieval
    events.ts              # SSE endpoint
    stats.ts               # Cost tracking, metrics
  sse/
    broadcaster.ts         # SSE connection manager and event emitter
    ring-buffer.ts         # Event buffer for reconnect catch-up
```

## Route Summary

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all registered projects |
| POST | `/api/projects` | Register a new target project |
| GET | `/api/projects/:id` | Get project details |
| PATCH | `/api/projects/:id` | Update project config (quality gates) |
| DELETE | `/api/projects/:id` | Remove a project |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects/:projectId/board` | Get Kanban board view (all tasks grouped by stage) |
| GET | `/api/tasks/:id` | Get task detail (includes history, handoffs, messages) |
| POST | `/api/projects/:projectId/tasks` | Create a new task |
| PATCH | `/api/tasks/:id` | Update task (priority, title, description) |
| POST | `/api/tasks/:id/move` | Force-move task to a stage (operator override) |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| POST | `/api/tasks/:id/defer` | Defer a task |
| POST | `/api/tasks/:id/reopen` | Reopen a deferred task |
| GET | `/api/tasks/:id/history` | Get task history timeline |
| GET | `/api/tasks/:id/handoffs` | Get handoff chain |
| GET | `/api/tasks/:id/deliverables` | Get task deliverables |

### Agents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents with status |
| GET | `/api/agents/:id` | Get agent detail |
| POST | `/api/agents/:id/pause` | Pause an agent |
| POST | `/api/agents/:id/resume` | Resume a paused/error agent |
| PATCH | `/api/agents/:id` | Update agent specialization |

### Messages
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/:taskId/messages` | Get all messages for a task |
| GET | `/api/messages?status=pending` | Get all pending messages (unresolved clarifications) |
| POST | `/api/agents/:id/message` | Send operator message to an agent |

### Memories
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents/:agentId/memories` | View agent memories |
| PATCH | `/api/memories/:id` | Edit a memory (operator override) |
| DELETE | `/api/memories/:id` | Delete a memory (operator override) |

### Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats/costs` | Cost summary (per agent, per task, per hour) |
| GET | `/api/stats/pipeline` | Pipeline throughput metrics |

### SSE
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | SSE stream |

## SSE Broadcaster

```typescript
// sse/broadcaster.ts

class SSEBroadcaster {
  private connections: Set<FastifyReply> = new Set();
  private buffer: RingBuffer<SSEEvent>;
  private eventId: number = 0;
  private keepaliveInterval: NodeJS.Timeout;

  constructor(bufferSize: number = 500) {
    this.buffer = new RingBuffer(bufferSize);
    this.keepaliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, 30_000);
  }

  addConnection(reply: FastifyReply, lastEventId?: string): void {
    this.connections.add(reply);

    // Send catch-up events
    if (lastEventId) {
      const missedEvents = this.buffer.getAfter(lastEventId);
      if (missedEvents === null) {
        // lastEventId too old — send full sync signal
        this.sendEvent(reply, { event: 'full-sync', data: '{}', id: String(this.eventId) });
      } else {
        for (const event of missedEvents) {
          this.sendEvent(reply, event);
        }
      }
    }

    reply.raw.on('close', () => {
      this.connections.delete(reply);
    });
  }

  emit(event: string, data: any): void {
    this.eventId++;
    const sseEvent: SSEEvent = {
      event,
      data: JSON.stringify(data),
      id: String(this.eventId),
    };

    this.buffer.push(sseEvent);

    for (const connection of this.connections) {
      this.sendEvent(connection, sseEvent);
    }
  }

  private sendEvent(reply: FastifyReply, event: SSEEvent): void {
    reply.raw.write(`id: ${event.id}\nevent: ${event.event}\ndata: ${event.data}\n\n`);
  }

  private sendKeepAlive(): void {
    for (const connection of this.connections) {
      connection.raw.write(': keepalive\n\n');
    }
  }

  shutdown(): void {
    clearInterval(this.keepaliveInterval);
    for (const connection of this.connections) {
      connection.raw.end();
    }
    this.connections.clear();
  }
}
```

## Ring Buffer

```typescript
// sse/ring-buffer.ts

class RingBuffer<T extends { id: string }> {
  private buffer: T[];
  private head: number = 0;
  private size: number = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  getAfter(id: string): T[] | null {
    const items = this.getAll();
    const idx = items.findIndex(item => item.id === id);
    if (idx === -1) return null; // ID not in buffer — too old
    return items.slice(idx + 1);
  }

  private getAll(): T[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [
      ...this.buffer.slice(this.head),
      ...this.buffer.slice(0, this.head),
    ];
  }
}
```

## SSE Event Payload

All SSE events use a canonical payload shape. Emitters must **not** send raw domain objects.

```typescript
// sse/event-types.ts

interface SSEEventPayload {
  taskId: string;
  projectId: string;
  agentId?: string;
  stage?: string;
  timestamp: string;
  [key: string]: unknown; // Additional event-specific fields
}
```

### Event Types

| Event | Description |
|-------|-------------|
| `task-updated` | Task stage, priority, or assignment changed |
| `agent-status` | Agent state changed (idle, busy, paused, error) |
| `new-message` | New inter-agent or operator message |
| `message-response` | Response to a clarification |
| `handoff` | Task handed off between agents |
| `quality-gate` | Quality gate result arrived |
| `defect-created` | New defect/bug task auto-created |
| `agent-error` | Agent encountered an unrecoverable error |
| `full-sync` | Client should refetch all data (buffer overflow) |

## SSE Route

```typescript
// routes/events.ts

export default async function eventsRoute(fastify: FastifyInstance) {
  fastify.get('/api/events', async (request, reply) => {
    const lastEventId = request.headers['last-event-id'] as string | undefined;

    // Tell Fastify we are managing the response manually
    reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    fastify.sseBroadcaster.addConnection(reply, lastEventId);

    // Keep connection open — Fastify won't auto-close
    // Connection cleanup handled in broadcaster via 'close' event
  });
}
```

## Example Task Route

```typescript
// routes/tasks.ts

export default async function taskRoutes(fastify: FastifyInstance) {
  // Get Kanban board
  fastify.get('/api/projects/:projectId/board', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const board = await fastify.db.tasks.getBoardView(projectId);
    return board;
  });

  // Create task
  fastify.post('/api/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const { title, description, priority, type } = request.body as CreateTaskInput;

    const task = await fastify.db.tasks.create({
      projectId,
      title,
      description,
      stage: 'todo',
      priority: priority || 'P2',
      type: type || 'feature',
    });

    // Emit canonical SSEEventPayload — not the raw task object
    fastify.sseBroadcaster.emit('task-updated', {
      taskId: task.id,
      projectId: task.projectId,
      stage: task.stage,
      timestamp: new Date().toISOString(),
    });
    reply.code(201).send(task);
  });

  // Force move (operator override)
  // forceMove() is defined in the pipeline module — see LLD-003 for full implementation.
  // It bypasses normal stage transition validation and records 'operator' as the mover.
  fastify.post('/api/tasks/:id/move', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { stage } = request.body as { stage: string };

    await fastify.orchestrator.pipeline.forceMove(id, stage, 'operator');

    const task = await fastify.db.tasks.getById(id);
    fastify.sseBroadcaster.emit('task-updated', {
      taskId: id,
      projectId: task.projectId,
      stage,
      timestamp: new Date().toISOString(),
    });
    return { success: true };
  });
}
```

## Operator Memory Overrides

The `PATCH /api/memories/:id` and `DELETE /api/memories/:id` operator routes bypass agent ownership checks. They call `MemoryManager.forceUpdate()` and `MemoryManager.forceDelete()` respectively, which skip the `agentId` ownership verification that normal agent tool calls enforce. See LLD-006 for the `forceUpdate` and `forceDelete` method signatures.
