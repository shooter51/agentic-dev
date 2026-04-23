import type { FastifyInstance } from 'fastify';
import { ProjectRepository } from '../db/repositories/project.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';

interface CreateProjectBody {
  name: string;
  path: string;
  config?: string;
}

interface UpdateProjectBody {
  name?: string;
  path?: string;
  config?: string;
}

export default async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = new ProjectRepository(db);

  fastify.get('/api/projects', async (_request, _reply) => {
    return repo.findAll();
  });

  fastify.post('/api/projects', async (request, reply) => {
    const body = request.body as CreateProjectBody;
    const project = await repo.create({
      name: body.name,
      path: body.path,
      config: body.config ?? null,
    });

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: '',
      projectId: project.id,
      timestamp: new Date().toISOString(),
    });

    reply.code(201).send(project);
  });

  fastify.get('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await repo.findById(id);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return project;
  });

  fastify.patch('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateProjectBody;

    const existing = await repo.findById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const updated = await repo.update(id, body);
    return updated;
  });

  fastify.delete('/api/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await repo.findById(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // Projects are deleted directly via DB; no cascading needed at route level
    const { projects } = await import('../db/schema/projects.js');
    const { eq } = await import('drizzle-orm');
    await db.delete(projects).where(eq(projects.id, id));

    reply.code(204).send();
  });
}
