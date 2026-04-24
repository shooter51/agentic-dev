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
  pipelineMode?: 'standard' | 'qa_automation';
  hitlStages?: string[];
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

const VALID_STAGE_NAMES = [
  'todo', 'product', 'architecture', 'development', 'tech_lead_review',
  'devops_build', 'manual_qa', 'automation', 'documentation',
  'devops_deploy', 'arch_review', 'done',
];

const QA_STAGES = ['manual_qa', 'automation'];

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

    const pipelineMode = body.pipelineMode ?? 'standard';
    const initialStage = pipelineMode === 'qa_automation' ? 'manual_qa' : 'todo';

    // Validate and filter hitlStages against valid stages for this pipeline mode
    const validStages = pipelineMode === 'qa_automation' ? QA_STAGES : VALID_STAGE_NAMES;
    const hitlStages = body.hitlStages?.filter((s) => validStages.includes(s)) ?? [];

    const task = await repo.create({
      projectId,
      title: body.title,
      description: body.description ?? null,
      stage: initialStage,
      priority: body.priority ?? 'P2',
      type: body.type ?? 'feature',
      pipelineMode,
      hitlStages: hitlStages.length > 0 ? JSON.stringify(hitlStages) : null,
      awaitingApproval: null,
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

    // Clear HITL approval block on force-move
    const { tasks: tasksTable } = await import('../db/schema/tasks.js');
    await db
      .update(tasksTable)
      .set({ awaitingApproval: null })
      .where(eq(tasksTable.id, id));

    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      await pipeline.forceMove(id, body.stage, 'operator');
    } else {
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

  // Reset a stuck task — clears retry counter and assignment so dispatch retries
  fastify.post('/api/tasks/:id/retry', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    // Clear assigned agent
    const { tasks: tasksTable } = await import('../db/schema/tasks.js');
    await db
      .update(tasksTable)
      .set({ assignedAgent: null, updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, id));

    // Clear retry counter in the orchestrator
    const orchestrator = (fastify as any).orchestrator;
    if (orchestrator?.taskRetries) {
      orchestrator.taskRetries.delete(id);
    }

    // Resume any errored agents that were working on this task
    const agents = await db.select().from((await import('../db/schema/agents.js')).agents);
    for (const agent of agents) {
      if (agent.status === 'error') {
        try {
          orchestrator?.resumeAgent(agent.id);
        } catch { /* ignore */ }
      }
    }

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: task.stage,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  });

  // Approve a HITL-blocked task — clears awaitingApproval and advances the pipeline
  fastify.post('/api/tasks/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await repo.findById(id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }
    if (!task.awaitingApproval) {
      return reply.code(400).send({ error: 'Task is not awaiting approval' });
    }

    const { tasks: tasksTable } = await import('../db/schema/tasks.js');

    // Clear the approval block
    await db
      .update(tasksTable)
      .set({ awaitingApproval: null, updatedAt: new Date().toISOString() })
      .where(eq(tasksTable.id, id));

    // Advance the pipeline
    const pipeline = (fastify as any).pipeline;
    if (pipeline) {
      const result = await pipeline.advance(id, 'operator');
      if (!result.success) {
        // Force-move if guards block — use pipeline FSM's own logic
        await pipeline.forceMove(id, task.stage === 'automation' && (task as any).pipelineMode === 'qa_automation' ? 'done' : undefined, 'operator');
      }
    }

    // Re-fetch to get the updated stage
    const updated = await repo.findById(id);

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.TASK_UPDATED, {
      taskId: id,
      projectId: task.projectId,
      stage: updated?.stage ?? task.stage,
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
