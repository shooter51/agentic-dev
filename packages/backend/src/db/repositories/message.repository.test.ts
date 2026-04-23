import { describe, it, expect, beforeEach } from 'vitest';
import { MessageRepository } from './message.repository.js';
import { TaskRepository } from './task.repository.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../test-helpers.js';

describe('MessageRepository', () => {
  let db: TestDB;
  let repo: MessageRepository;
  let taskRepo: TaskRepository;
  let projectId: string;
  let agentId: string;
  let agentId2: string;
  let taskId: string;

  beforeEach(async () => {
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    projectId = seeds.projectId;
    agentId = seeds.agentId;
    agentId2 = seeds.agentId2;
    repo = new MessageRepository(db as any);
    taskRepo = new TaskRepository(db as any);

    const task = await taskRepo.create({
      projectId,
      title: 'Test Task',
      description: null,
      stage: 'development',
      priority: 'P2',
      type: 'feature',
      assignedAgent: null,
      parentTaskId: null,
      beadsId: null,
      branchName: null,
      prUrl: null,
      metadata: null,
    } as any);
    taskId = task.id;
  });

  async function createMessage(overrides: Partial<{
    fromAgent: string;
    toAgent: string;
    type: string;
    content: string;
    status: string;
  }> = {}) {
    return repo.create({
      taskId,
      fromAgent: overrides.fromAgent ?? agentId,
      toAgent: overrides.toAgent ?? agentId2,
      type: (overrides.type ?? 'clarification') as any,
      content: overrides.content ?? 'Test message content',
      status: (overrides.status ?? 'pending') as any,
      response: null,
      respondedAt: null,
    });
  }

  describe('create', () => {
    it('creates a message with generated id and timestamp', async () => {
      const msg = await createMessage({ content: 'Hello agent!' });
      expect(msg.id).toBeDefined();
      expect(msg.content).toBe('Hello agent!');
      expect(msg.status).toBe('pending');
      expect(msg.createdAt).toBeTruthy();
    });

    it('creates notification messages', async () => {
      const msg = await createMessage({ type: 'notification', status: 'completed' });
      expect(msg.type).toBe('notification');
      expect(msg.status).toBe('completed');
    });
  });

  describe('findById', () => {
    it('returns the message when found', async () => {
      const created = await createMessage({ content: 'Find me' });
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.content).toBe('Find me');
    });

    it('returns null when not found', async () => {
      const result = await repo.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByTask', () => {
    it('returns all messages for a task ordered by createdAt', async () => {
      await createMessage({ content: 'First' });
      await createMessage({ content: 'Second' });
      const messages = await repo.findByTask(taskId);
      expect(messages).toHaveLength(2);
      // Order by createdAt ascending — first created is first
      expect(messages[0]!.content).toBe('First');
    });

    it('returns empty array for a task with no messages', async () => {
      const result = await repo.findByTask('nonexistent-task');
      expect(result).toEqual([]);
    });
  });

  describe('findPendingForAgent', () => {
    it('returns pending messages addressed to an agent', async () => {
      await createMessage({ toAgent: agentId2, status: 'pending' });
      await createMessage({ toAgent: agentId2, status: 'pending' });

      const pending = await repo.findPendingForAgent(agentId2);
      expect(pending).toHaveLength(2);
      expect(pending.every((m) => m.status === 'pending')).toBe(true);
      expect(pending.every((m) => m.toAgent === agentId2)).toBe(true);
    });

    it('excludes completed messages', async () => {
      await createMessage({ toAgent: agentId2, status: 'completed' });
      const pending = await repo.findPendingForAgent(agentId2);
      expect(pending).toHaveLength(0);
    });

    it('excludes expired messages', async () => {
      await createMessage({ toAgent: agentId2, status: 'pending' });
      const created = await createMessage({ toAgent: agentId2, status: 'pending' });
      await repo.expire(created.id);
      const pending = await repo.findPendingForAgent(agentId2);
      expect(pending).toHaveLength(1);
    });

    it('excludes messages to other agents', async () => {
      await createMessage({ toAgent: agentId, status: 'pending' }); // to agentId, not agentId2
      const pending = await repo.findPendingForAgent(agentId2);
      expect(pending).toHaveLength(0);
    });
  });

  describe('respond', () => {
    it('sets response, status to completed, and respondedAt', async () => {
      const msg = await createMessage({ status: 'pending' });
      await repo.respond(msg.id, 'Here is my answer');

      const updated = await repo.findById(msg.id);
      expect(updated!.response).toBe('Here is my answer');
      expect(updated!.status).toBe('completed');
      expect(updated!.respondedAt).toBeTruthy();
    });
  });

  describe('expire', () => {
    it('sets status to expired', async () => {
      const msg = await createMessage({ status: 'pending' });
      await repo.expire(msg.id);

      const updated = await repo.findById(msg.id);
      expect(updated!.status).toBe('expired');
    });
  });
});
