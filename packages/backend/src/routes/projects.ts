import type { FastifyInstance } from 'fastify';
import { ProjectRepository } from '../db/repositories/project.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';

const BLOCKED_PATH_PATTERNS = [
  /^\/var\/folders\//,
  /agentic-test/,
  /agentic-e2e/,
];

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

    // Block test/temp paths
    if (BLOCKED_PATH_PATTERNS.some((p) => p.test(body.path))) {
      return reply.code(400).send({ error: 'Project path is not allowed (test/temp paths are blocked)' });
    }

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

  // Import an existing project directory
  fastify.post('/api/projects/import', async (request, reply) => {
    const body = request.body as { path: string; name?: string };
    const dirPath = body.path?.trim();

    if (!dirPath) {
      return reply.code(400).send({ error: 'path is required' });
    }

    if (BLOCKED_PATH_PATTERNS.some((p) => p.test(dirPath))) {
      return reply.code(400).send({ error: 'Test paths are not allowed.' });
    }

    // Check path exists
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return reply.code(400).send({ error: 'Path is not a directory' });
      }
    } catch {
      return reply.code(400).send({ error: 'Path does not exist' });
    }

    // Check for duplicate
    const existing = await repo.findByPath?.(dirPath);
    if (existing) {
      return reply.code(409).send({ error: 'A project with this path already exists' });
    }

    // Auto-detect name from package.json or directory basename
    let name = body.name?.trim() || '';
    if (!name) {
      try {
        const pkgPath = path.join(dirPath, 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        name = pkg.name || '';
      } catch { /* no package.json */ }
      if (!name) {
        name = path.basename(dirPath);
      }
    }

    const project = await repo.create({ name, path: dirPath, config: null });
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

    // Block test/temp paths on path update
    if (body.path && BLOCKED_PATH_PATTERNS.some((p) => p.test(body.path!))) {
      return reply.code(400).send({ error: 'Project path is not allowed (test/temp paths are blocked)' });
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
