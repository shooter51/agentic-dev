import { describe, it, expect, beforeEach } from 'vitest';
import { TaskRepository } from './task.repository.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../test-helpers.js';

describe('TaskRepository', () => {
  let db: TestDB;
  let repo: TaskRepository;
  let projectId: string;
  let agentId: string;

  beforeEach(async () => {
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    projectId = seeds.projectId;
    agentId = seeds.agentId;
    repo = new TaskRepository(db as any);
  });

  async function createTask(overrides: Partial<{
    title: string;
    stage: string;
    priority: string;
    type: string;
    assignedAgent: string | null;
    parentTaskId: string | null;
    metadata: string | null;
    description: string | null;
    branchName: string | null;
    prUrl: string | null;
  }> = {}) {
    return repo.create({
      projectId,
      title: overrides.title ?? 'Test Task',
      description: overrides.description ?? null,
      stage: (overrides.stage ?? 'todo') as any,
      priority: (overrides.priority ?? 'P2') as any,
      type: (overrides.type ?? 'feature') as any,
      assignedAgent: overrides.assignedAgent ?? null,
      parentTaskId: overrides.parentTaskId ?? null,
      beadsId: null,
      branchName: overrides.branchName ?? null,
      prUrl: overrides.prUrl ?? null,
      metadata: overrides.metadata ?? null,
    });
  }

  describe('create', () => {
    it('creates a task and returns it with generated id', async () => {
      const task = await createTask({ title: 'My Feature' });
      expect(task.id).toBeDefined();
      expect(task.title).toBe('My Feature');
      expect(task.stage).toBe('todo');
      expect(task.projectId).toBe(projectId);
    });

    it('sets createdAt and updatedAt timestamps', async () => {
      const task = await createTask();
      expect(task.createdAt).toBeTruthy();
      expect(task.updatedAt).toBeTruthy();
    });
  });

  describe('findById', () => {
    it('returns the task when found', async () => {
      const created = await createTask({ title: 'Find Me' });
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Find Me');
    });

    it('returns null when not found', async () => {
      const result = await repo.findById('nonexistent-id');
      expect(result).toBeNull();
    });
  });

  describe('findByStage', () => {
    it('returns tasks in the given stage for a project', async () => {
      await createTask({ stage: 'product' });
      await createTask({ stage: 'product' });
      await createTask({ stage: 'development' });

      const results = await repo.findByStage(projectId, 'product');
      expect(results).toHaveLength(2);
      expect(results.every((t) => t.stage === 'product')).toBe(true);
    });

    it('returns empty array when no tasks in stage', async () => {
      const results = await repo.findByStage(projectId, 'arch_review');
      expect(results).toEqual([]);
    });
  });

  describe('updateStage', () => {
    it('updates the task stage', async () => {
      const task = await createTask({ stage: 'todo' });
      await repo.updateStage(task.id, 'product');
      const updated = await repo.findById(task.id);
      expect(updated!.stage).toBe('product');
    });

    it('sets assignedAgent when provided', async () => {
      const task = await createTask();
      await repo.updateStage(task.id, 'development', agentId);
      const updated = await repo.findById(task.id);
      expect(updated!.assignedAgent).toBe(agentId);
    });

    it('clears assignedAgent when not provided', async () => {
      const task = await createTask({ assignedAgent: agentId });
      await repo.updateStage(task.id, 'done');
      const updated = await repo.findById(task.id);
      expect(updated!.assignedAgent).toBeNull();
    });
  });

  describe('findReadyForDispatch', () => {
    it('returns tasks that have an active stage, no assigned agent, and no blocking defects', async () => {
      await createTask({ stage: 'product', assignedAgent: null });
      const result = await repo.findReadyForDispatch();
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((t) => t.stage === 'product')).toBe(true);
    });

    it('excludes todo, done, cancelled, deferred tasks', async () => {
      await createTask({ stage: 'todo' });
      await createTask({ stage: 'done' });
      await createTask({ stage: 'cancelled' });
      await createTask({ stage: 'deferred' });

      const result = await repo.findReadyForDispatch();
      const stages = result.map((t) => t.stage);
      expect(stages).not.toContain('todo');
      expect(stages).not.toContain('done');
      expect(stages).not.toContain('cancelled');
      expect(stages).not.toContain('deferred');
    });

    it('excludes tasks that already have an assigned agent', async () => {
      const task = await createTask({ stage: 'development', assignedAgent: agentId });
      const result = await repo.findReadyForDispatch();
      expect(result.some((t) => t.id === task.id)).toBe(false);
    });

    it('excludes tasks with active blocking child defects', async () => {
      const parent = await createTask({ stage: 'development' });
      // Create a bug child that is not done/cancelled
      await createTask({
        type: 'bug',
        stage: 'product',
        parentTaskId: parent.id,
      } as any);

      const result = await repo.findReadyForDispatch();
      expect(result.some((t) => t.id === parent.id)).toBe(false);
    });

    it('includes parent task when all child defects are resolved', async () => {
      const parent = await createTask({ stage: 'development' });
      const child = await createTask({
        type: 'bug',
        stage: 'done',
        parentTaskId: parent.id,
      } as any);
      // Child is done, so parent should not be blocked
      const result = await repo.findReadyForDispatch();
      expect(result.some((t) => t.id === parent.id)).toBe(true);
    });
  });

  describe('findChildDefects', () => {
    it('returns bug-type children for a parent task', async () => {
      const parent = await createTask();
      const bug = await createTask({ type: 'bug', parentTaskId: parent.id } as any);
      const feat = await createTask({ type: 'feature', parentTaskId: parent.id } as any);

      const defects = await repo.findChildDefects(parent.id);
      expect(defects.map((d) => d.id)).toContain(bug.id);
      expect(defects.map((d) => d.id)).not.toContain(feat.id);
    });

    it('returns empty array when no child defects', async () => {
      const parent = await createTask();
      const defects = await repo.findChildDefects(parent.id);
      expect(defects).toEqual([]);
    });
  });

  describe('findSubTasks', () => {
    it('returns feature and task type children', async () => {
      const parent = await createTask();
      const sub1 = await createTask({ type: 'feature', parentTaskId: parent.id } as any);
      const sub2 = await createTask({ type: 'task', parentTaskId: parent.id } as any);
      const bug = await createTask({ type: 'bug', parentTaskId: parent.id } as any);

      const subs = await repo.findSubTasks(parent.id);
      const ids = subs.map((s) => s.id);
      expect(ids).toContain(sub1.id);
      expect(ids).toContain(sub2.id);
      expect(ids).not.toContain(bug.id);
    });
  });

  describe('getBoardView', () => {
    it('returns tasks grouped by stage', async () => {
      await createTask({ stage: 'todo', title: 'Task A' });
      await createTask({ stage: 'todo', title: 'Task B' });
      await createTask({ stage: 'product', title: 'Task C' });

      const board = await repo.getBoardView(projectId);
      expect(board['todo']).toHaveLength(2);
      expect(board['product']).toHaveLength(1);
    });

    it('returns empty object when project has no tasks', async () => {
      const board = await repo.getBoardView('nonexistent-project');
      expect(Object.keys(board)).toHaveLength(0);
    });
  });
});
