import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRepository } from './memory.repository.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../test-helpers.js';

describe('MemoryRepository', () => {
  let db: TestDB;
  let repo: MemoryRepository;
  let agentId: string;
  let agentId2: string;
  let projectId: string;

  beforeEach(async () => {
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    agentId = seeds.agentId;
    agentId2 = seeds.agentId2;
    projectId = seeds.projectId;
    repo = new MemoryRepository(db as any);
  });

  async function createMemory(overrides: Partial<{
    agentId: string;
    projectId: string | null;
    type: string;
    title: string;
    content: string;
  }> = {}) {
    return repo.create({
      agentId: overrides.agentId ?? agentId,
      projectId: 'projectId' in overrides ? overrides.projectId : projectId,
      type: (overrides.type ?? 'project') as any,
      title: overrides.title ?? 'Test Memory',
      content: overrides.content ?? 'Memory content',
    });
  }

  describe('create', () => {
    it('creates a memory with generated id and timestamps', async () => {
      const mem = await createMemory({ title: 'My Memory' });
      expect(mem.id).toBeDefined();
      expect(mem.title).toBe('My Memory');
      expect(mem.agentId).toBe(agentId);
      expect(mem.createdAt).toBeTruthy();
      expect(mem.updatedAt).toBeTruthy();
    });

    it('stores null projectId for global memories', async () => {
      const mem = await createMemory({ projectId: null });
      expect(mem.projectId).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns memory when found', async () => {
      const created = await createMemory({ title: 'Find Me' });
      const found = await repo.findById(created.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Find Me');
    });

    it('returns null when not found', async () => {
      expect(await repo.findById('nonexistent')).toBeNull();
    });
  });

  describe('findByAgent', () => {
    it('returns all memories for an agent', async () => {
      await createMemory({ agentId, title: 'A' });
      await createMemory({ agentId, title: 'B' });
      await createMemory({ agentId: agentId2, title: 'C' }); // different agent

      const mems = await repo.findByAgent(agentId);
      expect(mems).toHaveLength(2);
      expect(mems.every((m) => m.agentId === agentId)).toBe(true);
    });

    it('orders results by createdAt ascending', async () => {
      const m1 = await createMemory({ title: 'First' });
      const m2 = await createMemory({ title: 'Second' });
      const mems = await repo.findByAgent(agentId);
      expect(mems[0]!.id).toBe(m1.id);
      expect(mems[1]!.id).toBe(m2.id);
    });

    it('returns empty array when agent has no memories', async () => {
      const result = await repo.findByAgent('nonexistent-agent');
      expect(result).toEqual([]);
    });
  });

  describe('findByAgentAndProject', () => {
    it('returns memories for specific agent and project', async () => {
      await createMemory({ agentId, projectId });
      await createMemory({ agentId, projectId }); // duplicate — both should be returned
      await createMemory({ agentId: agentId2, projectId }); // different agent — excluded

      const results = await repo.findByAgentAndProject(agentId, projectId);
      expect(results).toHaveLength(2); // two memories for agentId+projectId
      expect(results.every((r) => r.projectId === projectId)).toBe(true);
      expect(results.every((r) => r.agentId === agentId)).toBe(true);
    });

    it('returns empty array when no match', async () => {
      const result = await repo.findByAgentAndProject(agentId, 'no-such-project');
      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates title and content', async () => {
      const mem = await createMemory({ title: 'Old Title', content: 'Old Content' });
      const updated = await repo.update(mem.id, { title: 'New Title', content: 'New Content' });
      expect(updated.title).toBe('New Title');
      expect(updated.content).toBe('New Content');
    });

    it('updates updatedAt timestamp', async () => {
      const mem = await createMemory();
      const originalUpdatedAt = mem.updatedAt;
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      const updated = await repo.update(mem.id, { title: 'Updated' });
      expect(updated.updatedAt).not.toBe(originalUpdatedAt);
    });

    it('returns the updated memory', async () => {
      const mem = await createMemory({ title: 'Before' });
      const result = await repo.update(mem.id, { title: 'After' });
      expect(result.id).toBe(mem.id);
      expect(result.title).toBe('After');
    });
  });

  describe('delete', () => {
    it('deletes the memory', async () => {
      const mem = await createMemory();
      await repo.delete(mem.id);
      const found = await repo.findById(mem.id);
      expect(found).toBeNull();
    });

    it('does not throw when deleting nonexistent memory', async () => {
      await expect(repo.delete('nonexistent')).resolves.not.toThrow();
    });
  });
});
