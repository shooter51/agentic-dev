import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEBroadcaster } from './broadcaster.js';
import type { FastifyReply } from 'fastify';

function makeMockReply() {
  const listeners: Record<string, (() => void)[]> = {};
  const raw = {
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event]!.push(cb);
    }),
    _trigger: (event: string) => {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  };
  return { raw } as unknown as FastifyReply & { raw: typeof raw };
}

describe('SSEBroadcaster', () => {
  let broadcaster: SSEBroadcaster;

  beforeEach(() => {
    vi.useFakeTimers();
    broadcaster = new SSEBroadcaster(10);
  });

  afterEach(() => {
    broadcaster.shutdown();
    vi.useRealTimers();
  });

  describe('addConnection', () => {
    it('adds a connection and registers close listener', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      expect(reply.raw.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('removes connection on close event', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      // Emit an event to verify it reaches the connection
      broadcaster.emit('test', { data: 1 });
      expect(reply.raw.write).toHaveBeenCalledTimes(1);

      // Trigger close
      reply.raw._trigger('close');
      // After close, new events should not reach this connection
      broadcaster.emit('test', { data: 2 });
      expect(reply.raw.write).toHaveBeenCalledTimes(1); // still only 1
    });

    it('replays missed events when lastEventId is provided', () => {
      const reply1 = makeMockReply();
      broadcaster.addConnection(reply1);

      // Emit 3 events while reply1 is connected
      broadcaster.emit('evt', { n: 1 });
      broadcaster.emit('evt', { n: 2 });
      broadcaster.emit('evt', { n: 3 });

      // New connection with lastEventId of event 1
      const reply2 = makeMockReply();
      broadcaster.addConnection(reply2, '1'); // id='1' was first event

      // Should have received events 2 and 3 as replay
      expect(reply2.raw.write).toHaveBeenCalledTimes(2);
      const calls = reply2.raw.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls[0]).toContain('id: 2');
      expect(calls[1]).toContain('id: 3');
    });

    it('sends full-sync event when lastEventId is too old (not in buffer)', () => {
      const reply = makeMockReply();
      // Pass an id that was never in the buffer
      broadcaster.addConnection(reply, 'nonexistent-very-old-id');
      expect(reply.raw.write).toHaveBeenCalledTimes(1);
      const written = reply.raw.write.mock.calls[0][0] as string;
      expect(written).toContain('event: full-sync');
    });

    it('does not replay when no lastEventId is given', () => {
      const reply1 = makeMockReply();
      broadcaster.addConnection(reply1);
      broadcaster.emit('evt', { n: 1 });

      const reply2 = makeMockReply();
      broadcaster.addConnection(reply2); // no lastEventId
      expect(reply2.raw.write).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('broadcasts to all connected clients with correct SSE format', () => {
      const reply1 = makeMockReply();
      const reply2 = makeMockReply();
      broadcaster.addConnection(reply1);
      broadcaster.addConnection(reply2);

      broadcaster.emit('task-updated', { taskId: 'abc' });

      const expected = 'id: 1\nevent: task-updated\ndata: {"taskId":"abc"}\n\n';
      expect(reply1.raw.write).toHaveBeenCalledWith(expected);
      expect(reply2.raw.write).toHaveBeenCalledWith(expected);
    });

    it('increments event id on each emit', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      broadcaster.emit('a', {});
      broadcaster.emit('b', {});
      broadcaster.emit('c', {});

      const calls = reply.raw.write.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls[0]).toContain('id: 1');
      expect(calls[1]).toContain('id: 2');
      expect(calls[2]).toContain('id: 3');
    });

    it('stores events in the ring buffer', () => {
      const reply1 = makeMockReply();
      broadcaster.addConnection(reply1);
      broadcaster.emit('e1', { x: 1 });
      broadcaster.emit('e2', { x: 2 });

      // New connection replaying from after event 1
      const reply2 = makeMockReply();
      broadcaster.addConnection(reply2, '1');
      expect(reply2.raw.write).toHaveBeenCalledTimes(1);
      expect((reply2.raw.write.mock.calls[0][0] as string)).toContain('id: 2');
    });
  });

  describe('keepalive', () => {
    it('sends keepalive to all connections after 30 seconds', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      vi.advanceTimersByTime(30_000);
      expect(reply.raw.write).toHaveBeenCalledWith(': keepalive\n\n');
    });

    it('does not send keepalive to disconnected clients', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      reply.raw._trigger('close');
      vi.advanceTimersByTime(30_000);
      // Only the close registration call, no keepalive
      expect(reply.raw.write).not.toHaveBeenCalledWith(': keepalive\n\n');
    });
  });

  describe('shutdown', () => {
    it('ends all connections and clears them', () => {
      const reply1 = makeMockReply();
      const reply2 = makeMockReply();
      broadcaster.addConnection(reply1);
      broadcaster.addConnection(reply2);
      broadcaster.shutdown();
      expect(reply1.raw.end).toHaveBeenCalled();
      expect(reply2.raw.end).toHaveBeenCalled();
    });

    it('stops keepalive after shutdown', () => {
      const reply = makeMockReply();
      broadcaster.addConnection(reply);
      broadcaster.shutdown();
      vi.advanceTimersByTime(60_000);
      // end() was called but write() should not be called for keepalive
      expect(reply.raw.write).not.toHaveBeenCalledWith(': keepalive\n\n');
    });
  });
});
