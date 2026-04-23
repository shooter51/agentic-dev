import type { FastifyInstance } from 'fastify';

// Deliverable routes are registered in tasks.ts under /api/tasks/:id/deliverables
export default async function deliverableRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);
  // placeholder — routes handled in tasks.ts to avoid duplication
}
