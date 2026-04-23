/**
 * ConcurrencySemaphore — priority-aware semaphore for rate-limiting
 * concurrent Anthropic API calls.
 *
 * Acquire blocks when the semaphore is at capacity, queuing callers by
 * priority (P0 first). Release drains the queue in priority order.
 * reduceMax temporarily lowers the cap after a 429 response and restores
 * it after 60 seconds.
 */

// ---------------------------------------------------------------------------
// Priority ordering (lower number = higher priority)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
};

interface QueueEntry {
  resolve: () => void;
  priority: string;
}

// ---------------------------------------------------------------------------
// Minimal heap-based priority queue
// ---------------------------------------------------------------------------

class PriorityQueue<T> {
  private heap: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.heap.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i]!, this.heap[parent]!) < 0) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent]!, this.heap[i]!];
        i = parent;
      } else {
        break;
      }
    }
  }

  private sinkDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.compare(this.heap[left]!, this.heap[smallest]!) < 0) {
        smallest = left;
      }
      if (right < n && this.compare(this.heap[right]!, this.heap[smallest]!) < 0) {
        smallest = right;
      }
      if (smallest !== i) {
        [this.heap[i], this.heap[smallest]] = [this.heap[smallest]!, this.heap[i]!];
        i = smallest;
      } else {
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// ConcurrencySemaphore
// ---------------------------------------------------------------------------

export class ConcurrencySemaphore {
  private current: number = 0;
  private max: number;
  private readonly originalMax: number;
  private readonly queue: PriorityQueue<QueueEntry>;

  constructor(max: number) {
    this.max = max;
    this.originalMax = max;
    this.queue = new PriorityQueue<QueueEntry>(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99),
    );
  }

  /**
   * Acquire a slot. If at capacity, the caller waits in a priority queue.
   * Higher-priority tasks (lower P number) are served first.
   */
  async acquire(priority: string): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve, priority });
    });
  }

  /**
   * Release a slot. If callers are waiting, the highest-priority one
   * is immediately unblocked.
   */
  release(): void {
    this.current--;
    const next = this.queue.pop();
    if (next) {
      this.current++;
      next.resolve();
    }
  }

  /**
   * Called on a 429 rate-limit response — temporarily reduces max concurrency
   * by 1 and schedules a restore after 60 seconds.
   */
  reduceMax(): void {
    this.max = Math.max(1, this.max - 1);
    setTimeout(() => {
      this.max = Math.min(this.max + 1, this.originalMax);
    }, 60_000);
  }

  get currentCount(): number {
    return this.current;
  }

  get maxCount(): number {
    return this.max;
  }

  get queueSize(): number {
    return this.queue.size;
  }
}
