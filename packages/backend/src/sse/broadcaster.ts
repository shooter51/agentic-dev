import type { FastifyReply } from 'fastify';
import { RingBuffer } from './ring-buffer.js';
import type { SSEEvent } from './event-types.js';

const KEEPALIVE_INTERVAL_MS = 30_000;
const DEFAULT_BUFFER_SIZE = 500;

export class SSEBroadcaster {
  private readonly connections: Set<FastifyReply> = new Set();
  private readonly buffer: RingBuffer<SSEEvent>;
  private eventId: number = 0;
  private readonly keepaliveInterval: ReturnType<typeof setInterval>;

  constructor(bufferSize: number = DEFAULT_BUFFER_SIZE) {
    this.buffer = new RingBuffer<SSEEvent>(bufferSize);
    this.keepaliveInterval = setInterval(() => {
      this.sendKeepAlive();
    }, KEEPALIVE_INTERVAL_MS);
    // Allow the process to exit even if this interval is still running
    this.keepaliveInterval.unref?.();
  }

  addConnection(reply: FastifyReply, lastEventId?: string): void {
    this.connections.add(reply);

    if (lastEventId) {
      const missed = this.buffer.getAfter(lastEventId);
      if (missed === null) {
        // lastEventId is older than the ring buffer — tell the client to
        // refetch all data rather than try to replay a partial stream.
        this.eventId++;
        const syncEvent: SSEEvent = {
          id: String(this.eventId),
          event: 'full-sync',
          data: '{}',
        };
        this.sendEvent(reply, syncEvent);
      } else {
        for (const event of missed) {
          this.sendEvent(reply, event);
        }
      }
    }

    reply.raw.on('close', () => {
      this.connections.delete(reply);
    });
  }

  emit(event: string, data: unknown): void {
    this.eventId++;
    const sseEvent: SSEEvent = {
      id: String(this.eventId),
      event,
      data: JSON.stringify(data),
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
