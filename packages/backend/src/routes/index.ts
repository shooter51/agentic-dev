import type { FastifyInstance } from 'fastify';
import projectRoutes from './projects.js';
import taskRoutes from './tasks.js';
import agentRoutes from './agents.js';
import messageRoutes from './messages.js';
import memoriesRoutes from './memories.js';
import deliverableRoutes from './deliverables.js';
import eventsRoute from './events.js';
import statsRoutes from './stats.js';
import helpRoute from './help.js';
import fileRoutes from './files.js';

/**
 * Register all API route plugins on the Fastify instance.
 * Called once during server startup.
 */
export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(projectRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(agentRoutes);
  await fastify.register(messageRoutes);
  await fastify.register(memoriesRoutes);
  await fastify.register(deliverableRoutes);
  await fastify.register(eventsRoute);
  await fastify.register(statsRoutes);
  await fastify.register(helpRoute);
  await fastify.register(fileRoutes);
}
