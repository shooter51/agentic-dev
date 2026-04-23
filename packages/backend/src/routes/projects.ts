import type { FastifyInstance } from 'fastify';
import { stat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ProjectRepository } from '../db/repositories/project.repository.js';
import { TaskRepository } from '../db/repositories/task.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';

interface CreateProjectBody {
  name: string;
  path: string;
  config?: string;
  /** Optional description for the initial pipeline task */
  description?: string;
}

interface ImportProjectBody {
  path: string;
  name?: string;
  config?: string;
}

interface UpdateProjectBody {
  name?: string;
  path?: string;
  config?: string;
}

export default async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', fastify.authenticate);
  const repo = new ProjectRepository(db);
  const taskRepo = new TaskRepository(db);

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

    // Auto-create an initial task in the product stage so the pipeline picks it up
    const task = await taskRepo.create({
      projectId: project.id,
      title: body.name,
      description: body.description ?? null,
      stage: 'product',
      priority: 'P2',
      type: 'feature',
      assignedAgent: null,
      parentTaskId: null,
      beadsId: null,
      branchName: null,
      prUrl: null,
      metadata: null,
    });

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: task.id,
      projectId: project.id,
      stage: 'product',
      timestamp: new Date().toISOString(),
    });

    reply.code(201).send({ ...project, initialTaskId: task.id });
  });

  fastify.post('/api/projects/import', async (request, reply) => {
    const body = request.body as ImportProjectBody;
    const dirPath = body.path?.trim();

    if (!dirPath) {
      return reply.code(400).send({ error: 'path is required' });
    }

    // Validate path exists and is a directory
    let stats;
    try {
      stats = await stat(dirPath);
    } catch {
      return reply.code(400).send({ error: 'Path does not exist' });
    }

    if (!stats.isDirectory()) {
      return reply.code(400).send({ error: 'Path is not a directory' });
    }

    // Check for duplicate path
    const existing = await repo.findByPath(dirPath);
    if (existing) {
      return reply.code(409).send({ error: 'A project with this path already exists' });
    }

    // Auto-detect name if not provided
    let projectName = body.name?.trim();
    if (!projectName) {
      try {
        const pkgRaw = await readFile(`${dirPath}/package.json`, 'utf-8');
        const pkg = JSON.parse(pkgRaw);
        if (typeof pkg.name === 'string' && pkg.name.trim()) {
          projectName = pkg.name.trim();
        }
      } catch {
        // No package.json or invalid — fall through to basename
      }
      if (!projectName) {
        projectName = basename(dirPath);
      }
    }

    const project = await repo.create({
      name: projectName,
      path: dirPath,
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
