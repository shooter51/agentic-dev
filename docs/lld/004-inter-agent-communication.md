# LLD-004: Inter-Agent Communication

**References:** ADR-0005

## Overview

The message bus handles blocking clarification requests between agents, non-blocking notifications, handoff document creation, and deadlock detection.

## File Structure

```
packages/backend/src/
  messaging/
    index.ts               # Exports
    message-bus.ts          # Central EventEmitter-based bus
    message-service.ts      # CRUD + blocking logic
    deadlock-detector.ts    # Wait-for graph + cycle detection
    handoff-service.ts      # Handoff document creation and retrieval
```

## Message Bus

```typescript
// message-bus.ts

import { EventEmitter } from 'events';

const MESSAGE_PRIORITY: Record<string, number> = {
  rejection: 0,
  clarification: 1,
  notification: 2,
  status_update: 3,
};

class MessageBus extends EventEmitter {
  private deadlockDetector: DeadlockDetector;
  private pendingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private db: DB,
    private config: { timeoutMs: number }
  ) {
    super();
    this.deadlockDetector = new DeadlockDetector();
  }

  async sendBlocking(
    from: string,
    to: string,
    taskId: string,
    type: 'clarification' | 'rejection',
    content: string
  ): Promise<string> {
    // Check for deadlock before sending
    if (type === 'clarification') {
      const wouldDeadlock = this.deadlockDetector.wouldCauseCycle(from, to);
      if (wouldDeadlock) {
        throw new DeadlockError(`Sending from ${from} to ${to} would cause a deadlock`);
      }
      this.deadlockDetector.addEdge(from, to);
    }

    // Create message in DB
    const messageId = ulid();
    await this.db.insert(messages).values({
      id: messageId,
      taskId,
      fromAgent: from,
      toAgent: to,
      type,
      content,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    // Emit for orchestrator to route to recipient
    this.emit('message:new', { messageId, to, type, priority: MESSAGE_PRIORITY[type] });

    // Create blocking promise with timeout and cleanup
    return new Promise<string>((resolve, reject) => {
      const onResponse = (response: string) => {
        clearTimeout(timeout);
        this.pendingTimeouts.delete(messageId);
        this.deadlockDetector.removeEdge(from, to);
        resolve(response);
      };

      const timeout = setTimeout(async () => {
        this.removeListener(`message:response:${messageId}`, onResponse);
        this.pendingTimeouts.delete(messageId);
        this.deadlockDetector.removeEdge(from, to);

        await this.db.update(messages)
          .set({ status: 'expired' })
          .where(eq(messages.id, messageId));

        this.emit('message:expired', { messageId, from, to });
        reject(new MessageTimeoutError(`Message ${messageId} expired after ${this.config.timeoutMs}ms`));
      }, this.config.timeoutMs);

      this.pendingTimeouts.set(messageId, timeout);
      this.once(`message:response:${messageId}`, onResponse);
    });
  }

  async sendNotification(
    from: string,
    to: string,
    taskId: string,
    content: string
  ): Promise<void> {
    const messageId = ulid();
    await this.db.insert(messages).values({
      id: messageId,
      taskId,
      fromAgent: from,
      toAgent: to,
      type: 'notification',
      content,
      status: 'completed', // Notifications don't need responses
      createdAt: new Date().toISOString(),
    });

    this.emit('message:new', { messageId, to, type: 'notification', priority: 3 });
  }

  async respond(messageId: string, response: string): Promise<void> {
    await this.db.update(messages).set({
      response,
      status: 'completed',
      respondedAt: new Date().toISOString(),
    }).where(eq(messages.id, messageId));

    this.emit(`message:response:${messageId}`, response);
  }

  async recoverPendingMessages(): Promise<void> {
    const pending = await this.db.select().from(messages)
      .where(eq(messages.status, 'pending'));

    for (const msg of pending) {
      // Re-emit for orchestrator to route
      this.emit('message:new', {
        messageId: msg.id,
        to: msg.toAgent,
        type: msg.type,
        priority: MESSAGE_PRIORITY[msg.type],
      });
    }
  }

  shutdown(): void {
    for (const timeout of this.pendingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts.clear();
    this.removeAllListeners();
  }
}
```

## Deadlock Detector

```typescript
// deadlock-detector.ts

class DeadlockDetector {
  // Adjacency list: agent -> set of agents it's waiting on
  private waitGraph: Map<string, Set<string>> = new Map();

  addEdge(waiter: string, waitee: string): void {
    if (!this.waitGraph.has(waiter)) {
      this.waitGraph.set(waiter, new Set());
    }
    this.waitGraph.get(waiter)!.add(waitee);
  }

  removeEdge(waiter: string, waitee: string): void {
    this.waitGraph.get(waiter)?.delete(waitee);
  }

  wouldCauseCycle(from: string, to: string): boolean {
    // Temporarily add the edge and check for cycles
    this.addEdge(from, to);
    const hasCycle = this.detectCycle();
    this.removeEdge(from, to);
    return hasCycle;
  }

  private detectCycle(): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      inStack.add(node);

      const neighbors = this.waitGraph.get(node) ?? new Set();
      for (const neighbor of neighbors) {
        if (inStack.has(neighbor)) return true; // Cycle found
        if (!visited.has(neighbor) && dfs(neighbor)) return true;
      }

      inStack.delete(node);
      return false;
    };

    for (const node of this.waitGraph.keys()) {
      if (!visited.has(node) && dfs(node)) return true;
    }
    return false;
  }
}
```

## Handoff Service

```typescript
// handoff-service.ts

class HandoffService {
  constructor(private db: DB) {}

  async createHandoff(
    taskId: string,
    fromStage: string,
    toStage: string,
    fromAgent: string,
    content: string
  ): Promise<Handoff> {
    const id = ulid();
    await this.db.insert(handoffs).values({
      id,
      taskId,
      fromStage,
      toStage,
      fromAgent,
      content,
      createdAt: new Date().toISOString(),
    });
    return this.db.select().from(handoffs).where(eq(handoffs.id, id)).get()!;
  }

  async getLatestHandoff(taskId: string): Promise<Handoff | null> {
    return this.db.select().from(handoffs)
      .where(eq(handoffs.taskId, taskId))
      .orderBy(desc(handoffs.createdAt))
      .limit(1)
      .get() ?? null;
  }

  async getHandoffChain(taskId: string): Promise<Handoff[]> {
    return this.db.select().from(handoffs)
      .where(eq(handoffs.taskId, taskId))
      .orderBy(asc(handoffs.createdAt));
  }
}
```
