/**
 * Fixed-capacity ring buffer. Oldest entries are overwritten when full.
 * Items must have a string `id` field so `getAfter` can locate them.
 */
export class RingBuffer<T extends { id: string }> {
  private buffer: T[];
  private head: number = 0;
  private size: number = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array<T>(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.size = Math.min(this.size + 1, this.capacity);
  }

  /**
   * Returns all events that arrived after the given id, in insertion order.
   * Returns null when the id is not present (too old — buffer has wrapped).
   */
  getAfter(id: string): T[] | null {
    const items = this.getAll();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return null; // ID not in buffer — too old
    return items.slice(idx + 1);
  }

  /** Number of items currently stored. */
  get length(): number {
    return this.size;
  }

  private getAll(): T[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    // Buffer is full: oldest item is at head
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }
}
