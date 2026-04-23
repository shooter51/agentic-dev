import type { FastifyInstance } from 'fastify';
import { DeliverableRepository } from '../db/repositories/deliverable.repository.js';
import { db } from '../db/index.js';

export default async function deliverableRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = new DeliverableRepository(db);

  // Get deliverables for a task
  fastify.get('/api/tasks/:taskId/deliverables', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    return repo.findByTask(taskId);
  });
}
