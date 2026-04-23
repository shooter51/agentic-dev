import type { FastifyInstance } from 'fastify';
import { MessageRepository } from '../db/repositories/message.repository.js';
import { db } from '../db/index.js';
import { SSE_EVENTS } from '../sse/event-types.js';
import { messages as messagesTable } from '../db/schema/messages.js';
import { eq } from 'drizzle-orm';

interface OperatorMessageBody {
  taskId: string;
  content: string;
}

interface TaskMessageBody {
  content: string;
  toAgent?: string;
}

export default async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  const repo = new MessageRepository(db);

  // Get all messages for a task
  fastify.get('/api/tasks/:taskId/messages', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    return repo.findByTask(taskId);
  });

  // Get all pending messages (unresolved clarifications)
  fastify.get('/api/messages', async (request, _reply) => {
    const { status } = request.query as { status?: string };

    if (status === 'pending') {
      const result = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.status, 'pending'));
      return result;
    }

    // Default: return all messages
    return db.select().from(messagesTable);
  });

  // POST /api/tasks/:taskId/messages — operator message for a task
  fastify.post('/api/tasks/:taskId/messages', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as TaskMessageBody;

    // Route to the agent assigned to this task (if any), otherwise broadcast as notification
    const { TaskRepository } = await import('../db/repositories/task.repository.js');
    const taskRepo = new TaskRepository(db);
    const task = await taskRepo.findById(taskId);

    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }

    const toAgent = body.toAgent ?? task.assignedAgent ?? 'operator';

    const message = await repo.create({
      taskId,
      fromAgent: 'operator',
      toAgent,
      type: 'notification',
      content: body.content,
      status: 'completed',
      response: null,
      respondedAt: null,
    });

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.NEW_MESSAGE, {
      taskId,
      projectId: task.projectId,
      agentId: toAgent,
      messageId: message.id,
      timestamp: new Date().toISOString(),
    });

    reply.code(201).send(message);
  });

  // Send an operator message to an agent
  fastify.post('/api/agents/:id/message', async (request, reply) => {
    const { id: agentId } = request.params as { id: string };
    const body = request.body as OperatorMessageBody;

    // Operator messages are stored as notifications from 'operator' to the agent
    const message = await repo.create({
      taskId: body.taskId,
      fromAgent: 'operator',
      toAgent: agentId,
      type: 'notification',
      content: body.content,
      status: 'completed',
      response: null,
      respondedAt: null,
    });

    (fastify as any).sseBroadcaster?.emit(SSE_EVENTS.NEW_MESSAGE, {
      taskId: body.taskId,
      projectId: '',
      agentId,
      messageId: message.id,
      timestamp: new Date().toISOString(),
    });

    reply.code(201).send(message);
  });
}
