import { describe, it, expect, beforeEach } from 'vitest';
import { DeadlockDetector } from './deadlock-detector.js';

describe('DeadlockDetector', () => {
  let detector: DeadlockDetector;

  beforeEach(() => {
    detector = new DeadlockDetector();
  });

  describe('addEdge and detectCycle', () => {
    it('detects no cycle in an empty graph', () => {
      expect(detector.detectCycle()).toBe(false);
    });

    it('detects no cycle with a single edge A → B', () => {
      detector.addEdge('A', 'B');
      expect(detector.detectCycle()).toBe(false);
    });

    it('detects no cycle in a chain A → B → C', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      expect(detector.detectCycle()).toBe(false);
    });

    it('detects a simple cycle A → B → A', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'A');
      expect(detector.detectCycle()).toBe(true);
    });

    it('detects a 3-node cycle A → B → C → A', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      detector.addEdge('C', 'A');
      expect(detector.detectCycle()).toBe(true);
    });

    it('detects a self-loop A → A', () => {
      detector.addEdge('A', 'A');
      expect(detector.detectCycle()).toBe(true);
    });

    it('detects no cycle in a diamond graph without loop', () => {
      // A → B, A → C, B → D, C → D — DAG, no cycle
      detector.addEdge('A', 'B');
      detector.addEdge('A', 'C');
      detector.addEdge('B', 'D');
      detector.addEdge('C', 'D');
      expect(detector.detectCycle()).toBe(false);
    });

    it('detects cycle when back edge is added to a diamond', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('A', 'C');
      detector.addEdge('B', 'D');
      detector.addEdge('C', 'D');
      detector.addEdge('D', 'A'); // creates cycle
      expect(detector.detectCycle()).toBe(true);
    });
  });

  describe('removeEdge', () => {
    it('removes an edge, breaking a cycle', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'A');
      expect(detector.detectCycle()).toBe(true);
      detector.removeEdge('B', 'A');
      expect(detector.detectCycle()).toBe(false);
    });

    it('does not throw when removing an edge that does not exist', () => {
      expect(() => detector.removeEdge('A', 'B')).not.toThrow();
    });

    it('does not affect unrelated edges', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      detector.removeEdge('A', 'B');
      expect(detector.detectCycle()).toBe(false);
    });
  });

  describe('wouldCauseCycle', () => {
    it('returns false when no cycle would be created', () => {
      expect(detector.wouldCauseCycle('A', 'B')).toBe(false);
    });

    it('returns true when adding the edge would create a cycle', () => {
      detector.addEdge('B', 'A'); // B waits on A
      // Adding A → B would create A → B → A cycle
      expect(detector.wouldCauseCycle('A', 'B')).toBe(true);
    });

    it('does not permanently modify the graph', () => {
      detector.addEdge('B', 'A');
      detector.wouldCauseCycle('A', 'B'); // should detect but not persist
      // After the call, the graph should not have A → B
      expect(detector.detectCycle()).toBe(false);
    });

    it('returns false for a chain that does not close back', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      // Adding C → D does not create a cycle
      expect(detector.wouldCauseCycle('C', 'D')).toBe(false);
    });

    it('returns true for a 3-node cycle to be created', () => {
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      // Adding C → A would close the cycle
      expect(detector.wouldCauseCycle('C', 'A')).toBe(true);
    });

    it('works correctly with multiple independent components', () => {
      // Component 1: X → Y
      detector.addEdge('X', 'Y');
      // Component 2: A → B → C
      detector.addEdge('A', 'B');
      detector.addEdge('B', 'C');
      // Closing cycle in component 2 should return true
      expect(detector.wouldCauseCycle('C', 'A')).toBe(true);
      // Creating edge in component 1 that doesn't close cycle
      expect(detector.wouldCauseCycle('Y', 'Z')).toBe(false);
    });
  });
});
