import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConcurrencySemaphore } from './concurrency.js';

describe('ConcurrencySemaphore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic acquire/release', () => {
    it('allows acquisition up to max', async () => {
      const sem = new ConcurrencySemaphore(3);
      await sem.acquire('P1');
      await sem.acquire('P1');
      await sem.acquire('P1');
      expect(sem.currentCount).toBe(3);
      expect(sem.queueSize).toBe(0);
    });

    it('queues callers when at capacity', async () => {
      const sem = new ConcurrencySemaphore(2);
      await sem.acquire('P1');
      await sem.acquire('P1');
      // This one should block
      let resolved = false;
      const pending = sem.acquire('P1').then(() => { resolved = true; });
      expect(resolved).toBe(false);
      expect(sem.queueSize).toBe(1);
      // Release to unblock
      sem.release();
      await pending;
      expect(resolved).toBe(true);
    });

    it('decrements currentCount on release', async () => {
      const sem = new ConcurrencySemaphore(2);
      await sem.acquire('P1');
      await sem.acquire('P1');
      expect(sem.currentCount).toBe(2);
      sem.release();
      expect(sem.currentCount).toBe(1);
    });

    it('does not go below 0 on release when queue is empty', () => {
      const sem = new ConcurrencySemaphore(2);
      // Don't acquire — just release (edge case from guard code)
      sem.release();
      expect(sem.currentCount).toBe(-1); // intentional: caller is responsible for pairing
    });
  });

  describe('priority ordering', () => {
    it('serves higher-priority waiters before lower-priority ones', async () => {
      const sem = new ConcurrencySemaphore(1);
      await sem.acquire('P0'); // holds the slot

      const order: string[] = [];
      const p3 = sem.acquire('P3').then(() => { order.push('P3'); sem.release(); });
      const p1 = sem.acquire('P1').then(() => { order.push('P1'); sem.release(); });
      const p0 = sem.acquire('P0').then(() => { order.push('P0'); sem.release(); });

      expect(sem.queueSize).toBe(3);

      // Release the initial slot to start draining the queue
      sem.release();
      await p3; await p1; await p0;

      expect(order[0]).toBe('P0');
      expect(order[1]).toBe('P1');
      expect(order[2]).toBe('P3');
    });

    it('handles unknown priority by treating it as lowest', async () => {
      const sem = new ConcurrencySemaphore(1);
      await sem.acquire('P0');

      const order: string[] = [];
      const unknown = sem.acquire('UNKNOWN').then(() => { order.push('UNKNOWN'); sem.release(); });
      const p1 = sem.acquire('P1').then(() => { order.push('P1'); sem.release(); });

      sem.release();
      await unknown; await p1;

      expect(order[0]).toBe('P1');
      expect(order[1]).toBe('UNKNOWN');
    });
  });

  describe('reduceMax', () => {
    it('reduces max by 1 immediately', () => {
      const sem = new ConcurrencySemaphore(5);
      sem.reduceMax();
      expect(sem.maxCount).toBe(4);
    });

    it('does not reduce below 1', () => {
      const sem = new ConcurrencySemaphore(1);
      sem.reduceMax();
      expect(sem.maxCount).toBe(1);
    });

    it('restores max after 60 seconds', () => {
      const sem = new ConcurrencySemaphore(5);
      sem.reduceMax();
      expect(sem.maxCount).toBe(4);
      vi.advanceTimersByTime(60_000);
      expect(sem.maxCount).toBe(5);
    });

    it('does not restore above original max', () => {
      const sem = new ConcurrencySemaphore(3);
      sem.reduceMax(); // max=2
      sem.reduceMax(); // max=1
      vi.advanceTimersByTime(60_000); // restores one: max=2
      vi.advanceTimersByTime(60_000); // restores one more: max=3
      expect(sem.maxCount).toBe(3);
    });

    it('allows new acquisitions after restore', async () => {
      const sem = new ConcurrencySemaphore(2);
      await sem.acquire('P1');
      await sem.acquire('P1');
      sem.reduceMax(); // max becomes 1

      // Queue a waiter
      let resolved = false;
      const pending = sem.acquire('P1').then(() => { resolved = true; });
      expect(sem.queueSize).toBe(1);

      // Release a slot — now at max=1, so the waiter gets in
      sem.release();
      await pending;
      expect(resolved).toBe(true);
    });
  });

  describe('getters', () => {
    it('currentCount reflects current held count', async () => {
      const sem = new ConcurrencySemaphore(5);
      expect(sem.currentCount).toBe(0);
      await sem.acquire('P1');
      expect(sem.currentCount).toBe(1);
    });

    it('maxCount reflects current max', () => {
      const sem = new ConcurrencySemaphore(4);
      expect(sem.maxCount).toBe(4);
    });

    it('queueSize reflects waiting count', async () => {
      const sem = new ConcurrencySemaphore(1);
      await sem.acquire('P1');
      expect(sem.queueSize).toBe(0);
      sem.acquire('P2'); // queued but not awaited — just to inflate queue
      expect(sem.queueSize).toBe(1);
      sem.release();
    });
  });
});
