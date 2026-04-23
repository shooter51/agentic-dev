import type { FastifyInstance } from 'fastify';
import { MemoryRepository } from '../db/repositories/memory.repository.js';
import { MemoryManager } from '../memory/memory-manager.js';
import { db } from '../db/index.js';

interface UpdateMemoryBody {
  title?: string;
  content?: string;
}

export default async function memoriesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);
  const repo = new MemoryRepository(db);
  const manager = new MemoryManager(db);

  // View all memories for an agent
  fastify.get('/api/agents/:agentId/memories', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    return repo.findByAgent(agentId);
  });

  // Operator edit — bypasses ownership check via forceUpdate
  fastify.patch('/api/memories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateMemoryBody;

    const existing = await repo.findById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Memory not found' });
    }

    await manager.forceUpdate(id, body);
    return repo.findById(id);
  });

  // Operator delete — bypasses ownership check via forceDelete
  fastify.delete('/api/memories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await repo.findById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Memory not found' });
    }

    await manager.forceDelete(id);
    reply.code(204).send();
  });
}
