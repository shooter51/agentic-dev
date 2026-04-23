import type { FastifyInstance } from 'fastify';
import { TaskRepository } from '../db/repositories/task.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';
import { taskHistory } from '../db/schema/task-history.js';
import { eq } from 'drizzle-orm';

interface CreateTaskBody {
  title: string;
  description?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  type?: 'feature' | 'bug' | 'task' | 'chore';
}

interface UpdateTaskBody {
  title?: string;
  description?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  metadata?: Record<string, unknown> | string;
  branchName?: string;
}

interface ForceMoveBody {
  stage: string;
}

interface CancelBody {
  reason?: string;
}

interface DeferBody {
  reason?: string;
}

export default async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = new TaskRepository(db);

  // Board view — all tasks for a project grouped by stage
  fastify.get('/api/projects/:projectId/board', async (request, _reply) => {
    const { projectId } = request.params as { projectId: string };
    return repo.getBoardView(projectId);
  });

  // Create a task
  fastify.post('/api/projects/:projectId/tasks', async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as CreateTaskBody;

    const task = await repo.create({
      projectId,
      title: body.title,
      description: body.description ?? null,
      stage: 'todo',
      priority: body.priority ?? 'P2',
      type: body.type ?? 'feature',
      assignedAgent: null,
      parentTaskId: null,
      beadsId: null,
      branchName: null,
      prUrl: null,
      metadata: null,
    });

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: task.id,
      projectId: task.projectId,
      stage: task.stage,
      timestamp: new Date().toISOString(),
    });

    reply.code(201).send(task);
  });

  // Get task detail
  fastify.get('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }
    return task;
  });

  // Update task fields (priority, title, description)
  fastify.patch('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as UpdateTaskBody;

    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const { tasks: tasksTable } = await import('../db/schema/tasks.js');

    // Merge metadata as object (handle string input too)
    let mergedMetadata: string | undefined;
    if (body.metadata !== undefined) {
      const existingMeta: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');
      const incomingMeta: Record<string, unknown> =
        typeof body.metadata === 'string'
          ? (JSON.parse(body.metadata) as Record<string, unknown>)
          : body.metadata;
      mergedMetadata = JSON.stringify({ ...existingMeta, ...incomingMeta });
    }

    const { metadata: _metadata, ...bodyWithoutMeta } = body;
    void _metadata;

    await db
      .update(tasksTable)
      .set({
        ...bodyWithoutMeta,
        ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(tasksTable.id, id));

    const updated = await repo.findById(id);

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: task.stage,
      timestamp: new Date().toISOString(),
    });

    return updated;
  });

  // Force-move a task to a stage (operator override, bypasses guards)
  fastify.post('/api/tasks/:id/move', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as ForceMoveBody;

    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      await pipeline.forceMove(id, body.stage, 'operator');
    } else {
      // Fallback: direct DB update when pipeline not wired
      await repo.updateStage(id, body.stage as any);
    }

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: body.stage,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Cancel a task
  fastify.post('/api/tasks/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as CancelBody;

    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      await pipeline.cancel(id, body.reason ?? 'Cancelled by operator');
    } else {
      await repo.updateStage(id, 'cancelled');
    }

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: 'cancelled',
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Defer a task
  fastify.post('/api/tasks/:id/defer', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as DeferBody;

    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      await pipeline.defer(id, body.reason ?? 'Deferred by operator');
    } else {
      await repo.updateStage(id, 'deferred');
    }

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: 'deferred',
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Reopen a deferred task
  fastify.post('/api/tasks/:id/reopen', async (request, reply) => {
    const { id } = request.params as { id: string };

    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    if (task.stage !== 'deferred') {
      return reply.code(400).send({ error: 'Only deferred tasks can be reopened' });
    }

    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      await pipeline.reopen(id);
    } else {
      const metadata: Record<string, unknown> = JSON.parse(task.metadata ?? '{}');
      const previousStage = (metadata['previousStage'] as string | undefined) ?? 'todo';
      await repo.updateStage(id, previousStage as any);
    }

    const reopened = await repo.findById(id);

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: reopened?.stage ?? 'todo',
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Task history timeline
  fastify.get('/api/tasks/:id/history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const history = await db
      .select()
      .from(taskHistory)
      .where(eq(taskHistory.taskId, id))
      .orderBy(taskHistory.createdAt);

    return history;
  });

  // Handoff chain for a task
  fastify.get('/api/tasks/:id/handoffs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const { HandoffRepository } = await import('../db/repositories/handoff.repository.js');
    const handoffRepo = new HandoffRepository(db);
    return handoffRepo.findByTask(id);
  });

  // Deliverables for a task (also accessible under tasks)
  fastify.get('/api/tasks/:id/deliverables', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const { DeliverableRepository } = await import('../db/repositories/deliverable.repository.js');
    const deliverableRepo = new DeliverableRepository(db);
    return deliverableRepo.findByTask(id);
  });
}
