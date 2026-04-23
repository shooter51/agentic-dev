/**
 * CostTracker — tracks Anthropic API call costs and enforces budget caps.
 *
 * Two circuit breakers:
 *   - Per-task cap (default $10): prevent runaway single-task spend.
 *   - Per-hour cap (default $50): prevent runaway system-wide spend.
 *
 * CostLimitError is thrown by checkBudget() when a cap is exceeded.
 * The caller (runAgentWithErrorHandling) sets agent status to 'paused'.
 */

import { eq, and, gte } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { DB } from '../db';
import { apiCalls } from '../db/schema/api-calls';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class CostLimitError extends Error {
  readonly code = 'COST_LIMIT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'CostLimitError';
  }
}

// ---------------------------------------------------------------------------
// Pricing — per-token costs in USD (as of 2025-04).
// Updated when Anthropic changes prices.
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerToken: number;
  outputPerToken: number;
  cacheReadPerToken: number;
  cacheWritePerToken: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4-6': {
    inputPerToken: 15 / 1_000_000,
    outputPerToken: 75 / 1_000_000,
    cacheReadPerToken: 1.5 / 1_000_000,
    cacheWritePerToken: 18.75 / 1_000_000,
  },
  'claude-sonnet-4-6': {
    inputPerToken: 3 / 1_000_000,
    outputPerToken: 15 / 1_000_000,
    cacheReadPerToken: 0.3 / 1_000_000,
    cacheWritePerToken: 3.75 / 1_000_000,
  },
};

/** Fall back to opus pricing for unknown model names */
const DEFAULT_PRICING = MODEL_PRICING['claude-opus-4-6']!;

// ---------------------------------------------------------------------------
// Record type (matches what runAgentLoop passes to trackCall)
// ---------------------------------------------------------------------------

export interface ApiCallRecord {
  agentId: string;
  taskId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  status: 'success' | 'error' | 'rate_limited';
  errorCode?: string | null;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface CostTrackerConfig {
  perTaskCostCapUsd: number;   // Default: 10
  perHourCostCapUsd: number;   // Default: 50
}

// ---------------------------------------------------------------------------
// CostTracker
// ---------------------------------------------------------------------------

export class CostTracker {
  private readonly config: CostTrackerConfig;

  constructor(
    private readonly db: DB,
    config: Partial<CostTrackerConfig> = {},
  ) {
    this.config = {
      perTaskCostCapUsd: config.perTaskCostCapUsd ?? 10,
      perHourCostCapUsd: config.perHourCostCapUsd ?? 50,
    };
  }

  /**
   * Persist a new API call record. Called after every successful (or failed)
   * Anthropic messages.create() call.
   */
  async trackCall(call: ApiCallRecord): Promise<void> {
    await this.db.insert(apiCalls).values({
      id: ulid(),
      agentId: call.agentId,
      taskId: call.taskId,
      model: call.model,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      cacheReadTokens: call.cacheReadTokens,
      cacheWriteTokens: call.cacheWriteTokens,
      latencyMs: call.latencyMs,
      status: call.status,
      errorCode: call.errorCode ?? null,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Check both the per-task and per-hour budget caps.
   * Throws CostLimitError if either cap is exceeded.
   */
  async checkBudget(taskId: string): Promise<void> {
    const [taskCost, hourCost] = await Promise.all([
      this.getTaskCost(taskId),
      this.getHourlyCost(),
    ]);

    if (taskCost > this.config.perTaskCostCapUsd) {
      throw new CostLimitError(
        `Task ${taskId} exceeded $${this.config.perTaskCostCapUsd} budget (current: $${taskCost.toFixed(4)})`,
      );
    }

    if (hourCost > this.config.perHourCostCapUsd) {
      throw new CostLimitError(
        `Hourly spend exceeded $${this.config.perHourCostCapUsd} budget (current: $${hourCost.toFixed(4)})`,
      );
    }
  }

  /**
   * Returns the total USD cost of all API calls for a given task.
   */
  async getTaskCost(taskId: string): Promise<number> {
    const calls = await this.db
      .select()
      .from(apiCalls)
      .where(eq(apiCalls.taskId, taskId));

    return calls.reduce((sum, call) => sum + this.calculateCost(call), 0);
  }

  /**
   * Returns the total USD cost of all API calls in the past hour.
   */
  async getHourlyCost(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const calls = await this.db
      .select()
      .from(apiCalls)
      .where(gte(apiCalls.createdAt, oneHourAgo));

    return calls.reduce((sum, call) => sum + this.calculateCost(call), 0);
  }

  /**
   * Calculate the USD cost of a single API call record.
   */
  calculateCost(call: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }): number {
    const pricing = MODEL_PRICING[call.model] ?? DEFAULT_PRICING;
    return (
      call.inputTokens * pricing.inputPerToken +
      call.outputTokens * pricing.outputPerToken +
      call.cacheReadTokens * pricing.cacheReadPerToken +
      call.cacheWriteTokens * pricing.cacheWritePerToken
    );
  }
}
