/**
 * LoopDetector — detects when an agent gets stuck repeating the same tool
 * calls with identical results.
 *
 * Tracks a rolling window of (tool name + args + result hash) signatures per
 * agent. Throws LoopDetectedError after `threshold` consecutive identical
 * (call + result) pairs.
 */

import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class LoopDetectedError extends Error {
  readonly code = 'LOOP_DETECTED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'LoopDetectedError';
  }
}

// ---------------------------------------------------------------------------
// LoopDetector
// ---------------------------------------------------------------------------

export class LoopDetector {
  /** agentId -> rolling window of call signatures (with optional result hash) */
  private readonly history: Map<string, string[]> = new Map();
  private readonly threshold: number;

  constructor(threshold: number = 5) {
    this.threshold = threshold;
  }

  /**
   * Record a tool call before execution. Throws if the last `threshold`
   * call signatures (without results yet) are all identical — but the real
   * detection happens in recordResult() once we have the full call+result pair.
   */
  record(agentId: string, toolUse: ToolUseBlock): void {
    const signature = this.buildSignature(toolUse);
    const agentHistory = this.history.get(agentId) ?? [];
    agentHistory.push(signature);

    // Keep only the last threshold * 2 entries to bound memory usage
    if (agentHistory.length > this.threshold * 2) {
      agentHistory.splice(0, agentHistory.length - this.threshold * 2);
    }
    this.history.set(agentId, agentHistory);
  }

  /**
   * Record the result of a tool call. Amends the last history entry with a
   * hash of the result, then checks whether the last `threshold` full
   * (call + result) signatures are all identical.
   *
   * Throws LoopDetectedError if the threshold is exceeded.
   */
  recordResult(agentId: string, toolUse: ToolUseBlock, result: string): void {
    const resultHash = this.hashString(result);
    const agentHistory = this.history.get(agentId) ?? [];

    // Amend the last entry with the result hash
    if (agentHistory.length > 0) {
      agentHistory[agentHistory.length - 1] += `:${resultHash}`;
    }

    // Re-check with result included
    if (agentHistory.length >= this.threshold) {
      const recent = agentHistory.slice(-this.threshold);
      if (recent.every((sig) => sig === recent[0])) {
        throw new LoopDetectedError(
          `Agent ${agentId} repeated identical tool call+result ${this.threshold} times: ${toolUse.name}`,
        );
      }
    }
  }

  /**
   * Clear history for a specific agent (call after task completion or error
   * to prevent stale state from affecting the next task).
   */
  clear(agentId: string): void {
    this.history.delete(agentId);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildSignature(toolUse: ToolUseBlock): string {
    return `${toolUse.name}:${JSON.stringify(toolUse.input)}`;
  }

  /** FNV-1a hash for fast string comparison */
  private hashString(str: string): string {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(36);
  }
}
