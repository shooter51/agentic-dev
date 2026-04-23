import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageBus, DeadlockError, MessageTimeoutError } from './message-bus.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../db/test-helpers.js';
import { TaskRepository } from '../db/repositories/task.repository.js';
import * as schema from '../db/schema/index.js';

describe('MessageBus', () => {
  let db: TestDB;
  let bus: MessageBus;
  let taskId: string;
  let agentId: string;
  let agentId2: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    agentId = seeds.agentId;
    agentId2 = seeds.agentId2;

    // Create a task for FK references
    const taskRepo = new TaskRepository(db as any);
    const task = await taskRepo.create({
      projectId: seeds.projectId,
      title: 'Test Task',
      description: null,
      stage: 'development',
      priority: 'P2',
      type: 'feature',
      assignedAgent: null,
      parentTaskId: null,
      beadsId: null,
      branchName: null,
      prUrl: null,
      metadata: null,
    } as any);
    taskId = task.id;

    bus = new MessageBus(db as any, { timeoutMs: 5_000 });
  });

  afterEach(() => {
    bus.shutdown();
    vi.useRealTimers();
  });

  describe('DeadlockError', () => {
    it('has correct name, code, from, and to', () => {
      const err = new DeadlockError('A', 'B');
      expect(err.name).toBe('DeadlockError');
      expect(err.code).toBe('DEADLOCK');
      expect(err.from).toBe('A');
      expect(err.to).toBe('B');
      expect(err.message).toContain('A');
      expect(err.message).toContain('B');
    });
  });

  describe('MessageTimeoutError', () => {
    it('has correct name, code, messageId and timeout in message', () => {
      const err = new MessageTimeoutError('msg-123', 5000);
      expect(err.name).toBe('MessageTimeoutError');
      expect(err.code).toBe('TIMEOUT');
      expect(err.messageId).toBe('msg-123');
      expect(err.message).toContain('msg-123');
      expect(err.message).toContain('5000');
    });
  });

  /**
   * Helper: sends a blocking message and captures the message ID via the
   * message:new event (which fires synchronously during sendBlocking's async
   * chain, after the DB insert).
   */
  async function sendAndCapture(
    from: string,
    to: string,
    type: 'clarification' | 'rejection',
    content: string,
  ): Promise<{ promise: Promise<string>; messageId: string }> {
    return new Promise((resolveOuter) => {
      bus.once('message:new', (ev: any) => {
        resolveOuter({ promise: sendPromise, messageId: ev.messageId });
      });
      const sendPromise = bus.sendBlocking(from, to, taskId, type, content);
    });
  }

  describe('sendBlocking', () => {
    it('persists the message in the database', async () => {
      const { promise, messageId } = await sendAndCapture(agentId, agentId2, 'clarification', 'Please clarify');

      const messages = await db.select().from(schema.messages).all();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toBe('Please clarify');
      expect(messages[0]!.status).toBe('pending');

      await bus.respond(messageId, 'Response here');
      await promise;
    });

    it('emits message:new event with correct fields', async () => {
      const emitted: any[] = [];
      bus.on('message:new', (ev) => emitted.push(ev));

      const { promise, messageId } = await sendAndCapture(agentId, agentId2, 'clarification', 'Question?');

      expect(emitted).toHaveLength(1);
      expect(emitted[0]!.to).toBe(agentId2);
      expect(emitted[0]!.type).toBe('clarification');

      await bus.respond(messageId, 'Answer');
      await promise;
    });

    it('resolves with the response string when responded to', async () => {
      const { promise, messageId } = await sendAndCapture(agentId, agentId2, 'clarification', 'Question?');
      await bus.respond(messageId, 'The answer is 42');
      const response = await promise;
      expect(response).toBe('The answer is 42');
    });

    it('rejects with MessageTimeoutError when no response arrives', async () => {
      // Use real timers for this test only
      vi.useRealTimers();
      const shortBus = new MessageBus(db as any, { timeoutMs: 50 });
      const { promise } = await new Promise<{ promise: Promise<string>; messageId: string }>((resolve) => {
        shortBus.once('message:new', (ev: any) => resolve({ promise: sendPromise, messageId: ev.messageId }));
        const sendPromise = shortBus.sendBlocking(agentId, agentId2, taskId, 'clarification', 'Q?');
      });
      await expect(promise).rejects.toThrow(MessageTimeoutError);
      shortBus.shutdown();
    }, 5_000);

    it('expires the message in the DB on timeout', async () => {
      vi.useRealTimers();
      const shortBus = new MessageBus(db as any, { timeoutMs: 50 });
      const { promise } = await new Promise<{ promise: Promise<string>; messageId: string }>((resolve) => {
        shortBus.once('message:new', (ev: any) => resolve({ promise: sendPromise, messageId: ev.messageId }));
        const sendPromise = shortBus.sendBlocking(agentId, agentId2, taskId, 'clarification', 'Q?');
      });
      await promise.catch(() => {});
      await new Promise((r) => setTimeout(r, 20)); // let async DB update flush
      const messages = await db.select().from(schema.messages).all();
      expect(messages[0]!.status).toBe('expired');
      shortBus.shutdown();
    }, 5_000);

    it('emits message:expired event on timeout', async () => {
      vi.useRealTimers();
      const expired: any[] = [];
      const shortBus = new MessageBus(db as any, { timeoutMs: 50 });
      shortBus.on('message:expired', (ev) => expired.push(ev));
      const { promise } = await new Promise<{ promise: Promise<string>; messageId: string }>((resolve) => {
        shortBus.once('message:new', (ev: any) => resolve({ promise: sendPromise, messageId: ev.messageId }));
        const sendPromise = shortBus.sendBlocking(agentId, agentId2, taskId, 'clarification', 'Q?');
      });
      await promise.catch(() => {});
      await new Promise((r) => setTimeout(r, 20));
      expect(expired).toHaveLength(1);
      expect(expired[0]!.from).toBe(agentId);
      expect(expired[0]!.to).toBe(agentId2);
      shortBus.shutdown();
    }, 5_000);

    it('throws DeadlockError when sending would create a cycle', async () => {
      // Set up: agentId2 is waiting on agentId
      const { promise: promise1, messageId: id1 } = await sendAndCapture(agentId2, agentId, 'clarification', 'First question');

      // Now agentId trying to send to agentId2 would create a cycle
      await expect(
        bus.sendBlocking(agentId, agentId2, taskId, 'clarification', 'Would deadlock'),
      ).rejects.toThrow(DeadlockError);

      // Respond to clear the first message
      await bus.respond(id1, 'Response');
      await promise1;
    });

    it('sends rejection without deadlock check — clarification can proceed after', async () => {
      // rejection type should not go through deadlock detection
      // So clarification from agentId to agentId2 should still work after rejection
      const { promise: rejPromise, messageId: rejId } = await sendAndCapture(agentId2, agentId, 'rejection', 'Rejected');
      // Note: rejection doesn't add a wait-for edge, so the following clarification won't deadlock
      const { promise: clarPromise, messageId: clarId } = await sendAndCapture(agentId, agentId2, 'clarification', 'Q?');

      await bus.respond(clarId, 'ok');
      await clarPromise;

      // Respond to rejection to clean up
      await bus.respond(rejId, 'acknowledged');
      await rejPromise;
    });
  });

  describe('sendNotification', () => {
    it('persists notification with completed status', async () => {
      await bus.sendNotification(agentId, agentId2, taskId, 'Task completed!');

      const messages = await db.select().from(schema.messages).all();
      expect(messages).toHaveLength(1);
      expect(messages[0]!.type).toBe('notification');
      expect(messages[0]!.status).toBe('completed');
    });

    it('emits message:new event', async () => {
      const emitted: any[] = [];
      bus.on('message:new', (ev) => emitted.push(ev));

      await bus.sendNotification(agentId, agentId2, taskId, 'Hello!');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('notification');
    });
  });

  describe('respond', () => {
    it('updates message in DB and resolves the pending promise', async () => {
      const { promise, messageId } = await sendAndCapture(agentId, agentId2, 'clarification', 'Q?');
      await bus.respond(messageId, 'Answered!');
      await promise;

      const updated = await db.select().from(schema.messages).all();
      expect(updated[0]!.response).toBe('Answered!');
      expect(updated[0]!.status).toBe('completed');
      expect(updated[0]!.respondedAt).toBeTruthy();
    });
  });

  describe('recoverPendingMessages', () => {
    it('re-emits pending messages from the database', async () => {
      // Directly insert a pending message (simulating a previous crashed process)
      const now = new Date().toISOString();
      await db.insert(schema.messages).values({
        id: 'recovered-msg',
        taskId,
        fromAgent: agentId,
        toAgent: agentId2,
        type: 'clarification',
        content: 'Recovered question',
        status: 'pending',
        response: null,
        respondedAt: null,
        createdAt: now,
      });

      const emitted: any[] = [];
      bus.on('message:new', (ev) => emitted.push(ev));

      await bus.recoverPendingMessages();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].messageId).toBe('recovered-msg');
      expect(emitted[0].to).toBe(agentId2);
    });

    it('does not re-emit completed messages', async () => {
      const now = new Date().toISOString();
      await db.insert(schema.messages).values({
        id: 'completed-msg',
        taskId,
        fromAgent: agentId,
        toAgent: agentId2,
        type: 'notification',
        content: 'Done',
        status: 'completed',
        response: null,
        respondedAt: null,
        createdAt: now,
      });

      const emitted: any[] = [];
      bus.on('message:new', (ev) => emitted.push(ev));

      await bus.recoverPendingMessages();
      expect(emitted).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('clears pending timeouts and removes all listeners', async () => {
      const sendPromise = bus.sendBlocking(agentId, agentId2, taskId, 'clarification', 'Q?');
      bus.shutdown();

      // Advance timers — the timeout should be cleared so no rejection happens from the bus
      vi.advanceTimersByTime(10_000);

      // The promise is now dangling; shutdown should have cleared the timeout
      // We cannot await sendPromise as it may hang forever after shutdown
      expect(bus.listenerCount('message:new')).toBe(0);
    });
  });
});
