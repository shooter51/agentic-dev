/**
 * Wait-for graph with DFS cycle detection.
 *
 * An edge (waiter → waitee) represents "waiter is blocked waiting for a
 * response from waitee".  A cycle in this graph means a deadlock.
 */
export class DeadlockDetector {
  /** Adjacency list: agent → set of agents it is waiting on */
  private readonly waitGraph: Map<string, Set<string>> = new Map();

  addEdge(waiter: string, waitee: string): void {
    if (!this.waitGraph.has(waiter)) {
      this.waitGraph.set(waiter, new Set());
    }
    this.waitGraph.get(waiter)!.add(waitee);
  }

  removeEdge(waiter: string, waitee: string): void {
    this.waitGraph.get(waiter)?.delete(waitee);
  }

  /**
   * Returns true if adding the edge (from → to) would introduce a cycle.
   * The graph is left unchanged after the call.
   */
  wouldCauseCycle(from: string, to: string): boolean {
    this.addEdge(from, to);
    const hasCycle = this.detectCycle();
    this.removeEdge(from, to);
    return hasCycle;
  }

  /**
   * DFS-based cycle detection over the current wait graph.
   * Uses a recursion stack (inStack) to distinguish back-edges from
   * cross-/forward-edges.
   */
  detectCycle(): boolean {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      inStack.add(node);

      const neighbors = this.waitGraph.get(node) ?? new Set<string>();
      for (const neighbor of neighbors) {
        if (inStack.has(neighbor)) return true; // back-edge → cycle
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
