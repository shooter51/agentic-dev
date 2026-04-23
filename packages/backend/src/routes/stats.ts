import type { FastifyInstance } from 'fastify';
import { AgentRepository } from '../db/repositories/agent.repository.js';
import { db } from '../db/index.js';
import { apiCalls } from '../db/schema/api-calls.js';
import { eq, sql } from 'drizzle-orm';
import { CostTracker } from '../orchestrator/cost-tracker.js';

const costTracker = new CostTracker(db);

export default async function statsRoutes(fastify: FastifyInstance): Promise<void> {
  const agentRepo = new AgentRepository(db);

  // Cost summary — per agent and overall
  fastify.get('/api/stats/costs', async (_request, _reply) => {
    const allAgents = await agentRepo.findAll();

    const perAgent = await Promise.all(
      allAgents.map(async (agent) => {
        // Fetch all call records for this agent to compute cost using per-model pricing
        const calls = await db
          .select()
          .from(apiCalls)
          .where(eq(apiCalls.agentId, agent.id));

        const inputTokens = calls.reduce((s, c) => s + c.inputTokens, 0);
        const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
        const cacheReadTokens = calls.reduce((s, c) => s + c.cacheReadTokens, 0);
        const cacheWriteTokens = calls.reduce((s, c) => s + c.cacheWriteTokens, 0);
        const estimatedCostUsd = calls.reduce((s, c) => s + costTracker.calculateCost(c), 0);

        return {
          agentId: agent.id,
          role: agent.role,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          estimatedCostUsd,
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
