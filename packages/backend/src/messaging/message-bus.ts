import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DB } from '../db/index';
import { messages } from '../db/schema/messages';
import { DeadlockDetector } from './deadlock-detector';

/** Lower number = higher priority (interrupts first). */
const MESSAGE_PRIORITY: Record<string, number> = {
  rejection: 0,
  clarification: 1,
  notification: 2,
  status_update: 3,
};

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class DeadlockError extends Error {
  readonly code = 'DEADLOCK' as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Sending from ${from} to ${to} would cause a deadlock`);
    this.name = 'DeadlockError';
  }
}

export class MessageTimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;
  constructor(public readonly messageId: string, timeoutMs: number) {
    super(`Message ${messageId} expired after ${timeoutMs}ms`);
    this.name = 'MessageTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Event map — keeps EventEmitter calls type-safe
// ---------------------------------------------------------------------------

export interface MessageBusEvents {
  'message:new': [{ messageId: string; to: string; type: string; priority: number }];
  'message:expired': [{ messageId: string; from: string; to: string }];
  // Dynamic per-message response events are emitted as `message:response:<id>`
  [event: string]: unknown[];
}

// ---------------------------------------------------------------------------
// MessageBus
// ---------------------------------------------------------------------------

export interface MessageBusConfig {
  /** How long (ms) to wait for a response before expiring the message. Default: 10 minutes. */
  timeoutMs?: number;
}

export class MessageBus extends EventEmitter {
  private readonly deadlockDetector: DeadlockDetector;
  private readonly pendingTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly timeoutMs: number;

  constructor(
    private readonly db: DB,
    config: MessageBusConfig = {},
  ) {
    super();
    this.timeoutMs = config.timeoutMs ?? 10 * 60 * 1000; // 10 minutes
    this.deadlockDetector = new DeadlockDetector();
  }

  // -------------------------------------------------------------------------
  // sendBlocking — clarification / rejection
  // -------------------------------------------------------------------------

  /**
   * Persists a blocking message, emits it for routing, and returns a Promise
   * that resolves when the recipient calls `respond()`.
   *
   * Clarification messages are subject to deadlock detection.  If adding the
   * wait-for edge (from → to) would create a cycle the call throws
   * `DeadlockError` before touching the database.
   *
   * The Promise rejects with `MessageTimeoutError` if no response arrives
   * within `timeoutMs`.  All listeners and timeouts are cleaned up in every
   * code path.
   */
  async sendBlocking(
    from: string,
    to: string,
    taskId: string,
    type: 'clarification' | 'rejection',
    content: string,
  ): Promise<string> {
    // Deadlock guard (clarification only — rejections don't wait for a reply)
    if (type === 'clarification') {
      if (this.deadlockDetector.wouldCauseCycle(from, to)) {
        throw new DeadlockError(from, to);
      }
      this.deadlockDetector.addEdge(from, to);
    }

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

    // Emit so the orchestrator can route this to the recipient.
    // Higher-priority types (rejection, clarification) have lower numeric
    // values and should interrupt any queued work.
    this.emit('message:new', {
      messageId,
      to,
      type,
      priority: MESSAGE_PRIORITY[type] ?? 99,
    });

    return new Promise<string>((resolve, reject) => {
      const responseEvent = `message:response:${messageId}`;

      const cleanup = () => {
        const t = this.pendingTimeouts.get(messageId);
        if (t !== undefined) clearTimeout(t);
        this.pendingTimeouts.delete(messageId);
        if (type === 'clarification') {
          this.deadlockDetector.removeEdge(from, to);
        }
        this.removeListener(responseEvent, onResponse);
      };

      const onResponse = (response: string) => {
        cleanup();
        resolve(response);
      };

      const timeout = setTimeout(async () => {
        // removeListener before async work so we don't double-fire
        this.removeListener(responseEvent, onResponse);
        this.pendingTimeouts.delete(messageId);
        if (type === 'clarification') {
          this.deadlockDetector.removeEdge(from, to);
        }

        try {
          await this.db
            .update(messages)
            .set({ status: 'expired' })
            .where(eq(messages.id, messageId));
        } catch {
          // Best-effort — do not suppress the timeout rejection
        }

        this.emit('message:expired', { messageId, from, to });
        reject(new MessageTimeoutError(messageId, this.timeoutMs));
      }, this.timeoutMs);

      this.pendingTimeouts.set(messageId, timeout);
      // Use `once` — only one response is expected per message
      this.once(responseEvent, onResponse);
    });
  }

  // -------------------------------------------------------------------------
  // sendNotification — fire-and-forget
  // -------------------------------------------------------------------------

  /**
   * Persists a notification and emits it for delivery.  Notifications are
   * queued (not interruptive) and do not block the caller.
   */
  async sendNotification(
    from: string,
    to: string,
    taskId: string,
    content: string,
  ): Promise<void> {
    const messageId = ulid();

    await this.db.insert(messages).values({
      id: messageId,
      taskId,
      fromAgent: from,
      toAgent: to,
      type: 'notification',
      content,
      status: 'completed', // no response needed
      createdAt: new Date().toISOString(),
    });

    this.emit('message:new', {
      messageId,
      to,
      type: 'notification',
      priority: MESSAGE_PRIORITY['notification'],
    });
  }

  // -------------------------------------------------------------------------
  // respond — called by the recipient agent
  // -------------------------------------------------------------------------

  /**
   * Records the response in the database and signals the waiting Promise in
   * `sendBlocking`.
   */
  async respond(messageId: string, response: string): Promise<void> {
    await this.db
      .update(messages)
      .set({
        response,
        status: 'completed',
        respondedAt: new Date().toISOString(),
      })
      .where(eq(messages.id, messageId));

    // Emit triggers the `once` listener registered in sendBlocking
    this.emit(`message:response:${messageId}`, response);
  }

  // -------------------------------------------------------------------------
  // recoverPendingMessages — called on restart
  // -------------------------------------------------------------------------

  /**
   * Scans the database for messages still in `pending` status (i.e. the
   * process was killed before a response arrived) and re-emits them so the
   * orchestrator can re-deliver them to the appropriate agent.
   *
   * Note: No new Promises or timeouts are created here — recovery simply
   * replays the routing event.  Callers that were waiting for a response have
   * already gone away; the orchestrator is responsible for deciding how to
   * handle recovered messages (e.g. re-prompt the recipient agent).
   */
  async recoverPendingMessages(): Promise<void> {
    const pending = await this.db
      .select()
      .from(messages)
      .where(eq(messages.status, 'pending'));

    for (const msg of pending) {
      this.emit('message:new', {
        messageId: msg.id,
        to: msg.toAgent,
        type: msg.type,
        priority: MESSAGE_PRIORITY[msg.type] ?? 99,
      });
    }
  }

  // -------------------------------------------------------------------------
  // shutdown — graceful teardown
  // -------------------------------------------------------------------------

  /**
   * Clears all pending timeouts and removes all listeners.  Should be called
   * before the process exits to avoid dangling handles.
   */
  shutdown(): void {
    for (const timeout of this.pendingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.pendingTimeouts.clear();
    this.removeAllListeners();
  }
}
