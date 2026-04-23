import type { FastifyInstance } from 'fastify';
import { AgentRepository } from '../db/repositories/agent.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';
import { agents as agentsTable } from '../db/schema/agents.js';
import { eq } from 'drizzle-orm';

interface UpdateAgentBody {
  specialization?: string;
}

export default async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);
  const repo = new AgentRepository(db);

  // List all agents with status
  fastify.get('/api/agents', async (_request, _reply) => {
    return repo.findAll();
  });

  // Get agent detail
  fastify.get('/api/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await repo.findById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return agent;
  });

  // Pause an agent
  fastify.post('/api/agents/:id/pause', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await repo.findById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    const orchestrator = (fastify as any).orchestrator;
    if (orchestrator) {
      await orchestrator.pauseAgent(id);
    } else {
      await repo.updateStatus(id, 'paused');
    }

    return { success: true };
  });

  // Resume a paused or error agent
  fastify.post('/api/agents/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await repo.findById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    const orchestrator = (fastify as any).orchestrator;
    if (orchestrator) {
      await orchestrator.resumeAgent(id);
    } else {
      await repo.updateStatus(id, 'idle');
    }

    return { success: true };
  });

  // Update agent specialization
  fastify.patch('/api/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateAgentBody;

    const agent = await repo.findById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    await db
      .update(agentsTable)
      .set({ specialization: body.specialization ?? null, updatedAt: new Date().toISOString() })
      .where(eq(agentsTable.id, id));

    return repo.findById(id);
  });
}
