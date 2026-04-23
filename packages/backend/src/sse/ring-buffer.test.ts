import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ring-buffer.js';

interface TestItem {
  id: string;
  value: string;
}

describe('RingBuffer', () => {
  describe('push and length', () => {
    it('starts empty', () => {
      const buf = new RingBuffer<TestItem>(5);
      expect(buf.length).toBe(0);
    });

    it('increments length on push up to capacity', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push({ id: '1', value: 'a' });
      expect(buf.length).toBe(1);
      buf.push({ id: '2', value: 'b' });
      expect(buf.length).toBe(2);
      buf.push({ id: '3', value: 'c' });
      expect(buf.length).toBe(3);
    });

    it('does not exceed capacity when overfilled', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      buf.push({ id: '3', value: 'c' });
      buf.push({ id: '4', value: 'd' });
      expect(buf.length).toBe(3);
    });
  });

  describe('getAll (via getAfter)', () => {
    it('returns items in insertion order when not full', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      buf.push({ id: '3', value: 'c' });
      // Use getAfter with an invalid id to trigger null, then verify with valid id
      const after1 = buf.getAfter('1');
      expect(after1).toEqual([
        { id: '2', value: 'b' },
        { id: '3', value: 'c' },
      ]);
    });

    it('returns empty array when id is the last element', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      expect(buf.getAfter('2')).toEqual([]);
    });
  });

  describe('getAfter', () => {
    it('returns null when id is not present', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push({ id: '1', value: 'a' });
      expect(buf.getAfter('nonexistent')).toBeNull();
    });

    it('returns null when id has been overwritten by wrap-around', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      buf.push({ id: '3', value: 'c' });
      // Push a 4th item, overwriting id '1'
      buf.push({ id: '4', value: 'd' });
      expect(buf.getAfter('1')).toBeNull();
    });

    it('returns correct items after wrap-around', () => {
      const buf = new RingBuffer<TestItem>(3);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      buf.push({ id: '3', value: 'c' });
      buf.push({ id: '4', value: 'd' }); // overwrites id '1'
      // Buffer should be [2, 3, 4] in insertion order
      const result = buf.getAfter('2');
      expect(result).toEqual([
        { id: '3', value: 'c' },
        { id: '4', value: 'd' },
      ]);
    });

    it('returns all items when id is the first element', () => {
      const buf = new RingBuffer<TestItem>(5);
      buf.push({ id: '1', value: 'a' });
      buf.push({ id: '2', value: 'b' });
      buf.push({ id: '3', value: 'c' });
      const result = buf.getAfter('1');
      expect(result).toEqual([
        { id: '2', value: 'b' },
        { id: '3', value: 'c' },
      ]);
    });

    it('preserves insertion order across multiple wraps', () => {
      const buf = new RingBuffer<TestItem>(3);
      // Fill twice over
      for (let i = 1; i <= 6; i++) {
        buf.push({ id: String(i), value: `v${i}` });
      }
      // Only ids 4, 5, 6 remain
      expect(buf.getAfter('1')).toBeNull();
      const after4 = buf.getAfter('4');
      expect(after4).toEqual([
        { id: '5', value: 'v5' },
        { id: '6', value: 'v6' },
      ]);
    });

    it('works with capacity of 1', () => {
      const buf = new RingBuffer<TestItem>(1);
      buf.push({ id: '1', value: 'a' });
      expect(buf.getAfter('1')).toEqual([]);
      buf.push({ id: '2', value: 'b' });
      expect(buf.getAfter('1')).toBeNull();
      expect(buf.getAfter('2')).toEqual([]);
    });
  });
});
