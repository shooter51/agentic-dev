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

    await repo.updateStatus(id, 'paused');

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.AGENT_STATUS, {
      taskId: agent.currentTask ?? '',
      projectId: '',
      agentId: id,
      status: 'paused',
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Resume a paused or error agent
  fastify.post('/api/agents/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    const agent = await repo.findById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    await repo.updateStatus(id, 'idle');

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.AGENT_STATUS, {
      taskId: agent.currentTask ?? '',
      projectId: '',
      agentId: id,
      status: 'idle',
      timestamp: new Date().toISOString(),
    });

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
