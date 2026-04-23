import type { FastifyInstance } from 'fastify';
import { ApiCallRepository } from '../db/repositories/api-call.repository.js';
import { AgentRepository } from '../db/repositories/agent.repository.js';
import { db } from '../db/index.js';
import { apiCalls } from '../db/schema/api-calls.js';
import { eq, sql, sum } from 'drizzle-orm';

// Approximate pricing per million tokens (Anthropic claude-3-5-sonnet defaults)
const COST_PER_M_INPUT = 3.0;
const COST_PER_M_OUTPUT = 15.0;
const COST_PER_M_CACHE_READ = 0.3;
const COST_PER_M_CACHE_WRITE = 3.75;

function computeCostUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
): number {
  return (
    (inputTokens / 1_000_000) * COST_PER_M_INPUT +
    (outputTokens / 1_000_000) * COST_PER_M_OUTPUT +
    (cacheReadTokens / 1_000_000) * COST_PER_M_CACHE_READ +
    (cacheWriteTokens / 1_000_000) * COST_PER_M_CACHE_WRITE
  );
}

export default async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  const apiCallRepo = new ApiCallRepository(db);
  const agentRepo = new AgentRepository(db);

  // Cost summary — per agent and overall
  fastify.get('/api/stats/costs', async (_request, _reply) => {
    const allAgents = await agentRepo.findAll();

    const perAgent = await Promise.all(
      allAgents.map(async (agent) => {
        const tokens = await apiCallRepo.getTokenSummaryByAgent(agent.id);
        return {
          agentId: agent.id,
          role: agent.role,
          ...tokens,
          estimatedCostUsd: computeCostUsd(
            tokens.inputTokens,
            tokens.outputTokens,
            tokens.cacheReadTokens,
            tokens.cacheWriteTokens,
          ),
        };
      }),
    );

    const totals = perAgent.reduce(
      (acc, a) => ({
        inputTokens: acc.inputTokens + a.inputTokens,
        outputTokens: acc.outputTokens + a.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + a.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens + a.cacheWriteTokens,
        estimatedCostUsd: acc.estimatedCostUsd + a.estimatedCostUsd,
      }),
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0 },
    );

    return { perAgent, totals };
  });

  // Pipeline throughput metrics
  fastify.get('/api/stats/pipeline', async (_request, _reply) => {
    const { tasks: tasksTable } = await import('../db/schema/tasks.js');

    const stageCounts = await db
      .select({
        stage: tasksTable.stage,
        count: sql<number>`count(*)`,
      })
      .from(tasksTable)
      .groupBy(tasksTable.stage);

    const totalApiCalls = await db
      .select({ count: sql<number>`count(*)` })
      .from(apiCalls)
      .get();

    const avgLatency = await db
      .select({ avg: sql<number>`avg(latency_ms)` })
      .from(apiCalls)
      .get();

    return {
      tasksByStage: Object.fromEntries(stageCounts.map((r) => [r.stage, r.count])),
      totalApiCalls: totalApiCalls?.count ?? 0,
      avgLatencyMs: Math.round(avgLatency?.avg ?? 0),
    };
  });
}
