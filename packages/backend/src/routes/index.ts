import type { FastifyInstance } from 'fastify';
import authRoutes from './auth.js';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import agentRoutes from './agents.js';
import messageRoutes from './messages.js';
import memoriesRoutes from './memories.js';
import deliverableRoutes from './deliverables.js';
import eventsRoute from './events.js';
import statsRoutes from './stats.js';
import helpRoute from './help.js';

/**
 * Register all API route plugins on the Fastify instance.
 * Called once during server startup.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Health check — no auth required
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Auth routes registered first (login/refresh are public)
  await fastify.register(authRoutes);

  // All other routes require authentication (via addHook in each plugin)
  await fastify.register(projectRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(agentRoutes);
  await fastify.register(messageRoutes);
  await fastify.register(memoriesRoutes);
  await fastify.register(deliverableRoutes);
  await fastify.register(eventsRoute);
  await fastify.register(statsRoutes);
  await fastify.register(helpRoute);
}
