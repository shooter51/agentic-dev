import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CostTracker, CostLimitError } from './cost-tracker.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../db/test-helpers.js';
import * as schema from '../db/schema/index.js';

describe('CostTracker', () => {
  let db: TestDB;
  let tracker: CostTracker;
  let agentId: string;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    agentId = seeds.agentId;
    tracker = new CostTracker(db as any);

    // Create a task for FK references
    const { TaskRepository } = await import('../db/repositories/task.repository.js');
    const taskRepo = new TaskRepository(db as any);
    const task = await taskRepo.create({
      projectId: seeds.projectId,
      title: 'Cost Test Task',
      description: null,
      stage: 'development',
      priority: 'P2',
      type: 'feature',
      assignedAgent: null,
      parentTaskId: null,
      beadsId: null,
      branchName: null,
      prUrl: null,
      metadata: null,
    } as any);
    taskId = task.id;
  });

  describe('CostLimitError', () => {
    it('has correct name and code', () => {
      const err = new CostLimitError('over budget');
      expect(err.name).toBe('CostLimitError');
      expect(err.code).toBe('COST_LIMIT');
      expect(err.message).toBe('over budget');
    });
  });

  describe('calculateCost', () => {
    it('calculates cost for claude-sonnet-4-6 correctly', () => {
      const cost = tracker.calculateCost({
        model: 'claude-sonnet-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(cost).toBeCloseTo(3.0, 5); // $3 per 1M input tokens
    });

    it('calculates output token cost correctly', () => {
      const cost = tracker.calculateCost({
        model: 'claude-sonnet-4-6',
        inputTokens: 0,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(cost).toBeCloseTo(15.0, 5); // $15 per 1M output tokens
    });

    it('calculates cache read cost correctly', () => {
      const cost = tracker.calculateCost({
        model: 'claude-sonnet-4-6',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 0,
      });
      expect(cost).toBeCloseTo(0.3, 5); // $0.30 per 1M cache read tokens
    });

    it('calculates cache write cost correctly', () => {
      const cost = tracker.calculateCost({
        model: 'claude-sonnet-4-6',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 1_000_000,
      });
      expect(cost).toBeCloseTo(3.75, 5); // $3.75 per 1M cache write tokens
    });

    it('calculates opus cost correctly', () => {
      const cost = tracker.calculateCost({
        model: 'claude-opus-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(cost).toBeCloseTo(15.0, 5); // $15 per 1M input tokens for opus
    });

    it('falls back to opus pricing for unknown models', () => {
      const costUnknown = tracker.calculateCost({
        model: 'unknown-model',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      const costOpus = tracker.calculateCost({
        model: 'claude-opus-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      expect(costUnknown).toBe(costOpus);
    });

    it('sums all token types', () => {
      const cost = tracker.calculateCost({
        model: 'claude-sonnet-4-6',
        inputTokens: 100_000,
        outputTokens: 100_000,
        cacheReadTokens: 100_000,
        cacheWriteTokens: 100_000,
      });
      const expected =
        (100_000 * 3) / 1_000_000 +  // input
        (100_000 * 15) / 1_000_000 +  // output
        (100_000 * 0.3) / 1_000_000 + // cache read
        (100_000 * 3.75) / 1_000_000; // cache write
      expect(cost).toBeCloseTo(expected, 8);
    });
  });

  describe('trackCall', () => {
    it('persists an API call record in the database', async () => {
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1500,
        status: 'success',
        errorCode: null,
      });

      const calls = await db.select().from(schema.apiCalls).all();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.model).toBe('claude-sonnet-4-6');
      expect(calls[0]!.inputTokens).toBe(1000);
      expect(calls[0]!.status).toBe('success');
    });

    it('stores errorCode when provided', async () => {
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 0,
        status: 'error',
        errorCode: 'rate_limit',
      });

      const calls = await db.select().from(schema.apiCalls).all();
      expect(calls[0]!.errorCode).toBe('rate_limit');
    });
  });

  describe('getTaskCost', () => {
    it('returns 0 when no API calls exist for the task', async () => {
      const cost = await tracker.getTaskCost('nonexistent-task');
      expect(cost).toBe(0);
    });

    it('returns the sum of costs for all calls in a task', async () => {
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      const cost = await tracker.getTaskCost(taskId);
      expect(cost).toBeCloseTo(6.0, 5); // 2 × $3
    });
  });

  describe('getHourlyCost', () => {
    it('returns 0 when no API calls exist', async () => {
      const cost = await tracker.getHourlyCost();
      expect(cost).toBe(0);
    });

    it('returns cost of calls within the last hour', async () => {
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      const cost = await tracker.getHourlyCost();
      expect(cost).toBeCloseTo(3.0, 5);
    });
  });

  describe('checkBudget', () => {
    it('does not throw when within both caps', async () => {
      const smallTracker = new CostTracker(db as any, {
        perTaskCostCapUsd: 100,
        perHourCostCapUsd: 100,
      });
      await expect(smallTracker.checkBudget(taskId)).resolves.not.toThrow();
    });

    it('throws CostLimitError when task cost exceeds per-task cap', async () => {
      // Insert API calls that cost $12 total (above default $10 cap)
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-opus-4-6', // $15/M input tokens
        inputTokens: 800_000, // $12 total
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      await expect(tracker.checkBudget(taskId)).rejects.toThrow(CostLimitError);
    });

    it('throws CostLimitError when hourly cost exceeds per-hour cap', async () => {
      const tightTracker = new CostTracker(db as any, {
        perTaskCostCapUsd: 100,
        perHourCostCapUsd: 1, // $1 cap per hour
      });

      await tightTracker.trackCall({
        agentId,
        taskId,
        model: 'claude-sonnet-4-6',
        inputTokens: 1_000_000, // $3
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      await expect(tightTracker.checkBudget(taskId)).rejects.toThrow(CostLimitError);
    });

    it('error message includes the exceeded amount', async () => {
      await tracker.trackCall({
        agentId,
        taskId,
        model: 'claude-opus-4-6',
        inputTokens: 800_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 1000,
        status: 'success',
        errorCode: null,
      });

      try {
        await tracker.checkBudget(taskId);
      } catch (err) {
        expect((err as Error).message).toContain('$10');
      }
    });
  });
});
