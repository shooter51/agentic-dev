import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryManager } from './memory-manager.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../db/test-helpers.js';

describe('MemoryManager', () => {
  let db: TestDB;
  let manager: MemoryManager;
  let agentId: string;
  let agentId2: string;
  let projectId: string;

  beforeEach(async () => {
    db = createTestDb();
    const seeds = await seedBasicEntities(db);
    agentId = seeds.agentId;
    agentId2 = seeds.agentId2;
    projectId = seeds.projectId;
    manager = new MemoryManager(db as any);
  });

  describe('create', () => {
    it('creates a memory and returns it', async () => {
      const result = await manager.create(agentId, {
        title: 'My Decision',
        content: 'We chose React because of the ecosystem',
        type: 'decision',
        projectId,
      });

      expect(result.memory.id).toBeDefined();
      expect(result.memory.title).toBe('My Decision');
      expect(result.memory.content).toBe('We chose React because of the ecosystem');
      expect(result.memory.type).toBe('decision');
      expect(result.memory.agentId).toBe(agentId);
    });

    it('stores global memory when projectId is omitted', async () => {
      const result = await manager.create(agentId, {
        title: 'Global Pattern',
        content: 'Always use typed constants',
        type: 'pattern',
      });

      expect(result.memory.projectId).toBeNull();
    });

    it('stores global memory when projectId is explicitly null', async () => {
      const result = await manager.create(agentId, {
        title: 'Global',
        content: 'content',
        type: 'pattern',
        projectId: null,
      });

      expect(result.memory.projectId).toBeNull();
    });

    it('throws when content exceeds 8000 characters', async () => {
      await expect(
        manager.create(agentId, {
          title: 'Too Long',
          content: 'x'.repeat(8001),
          type: 'project',
          projectId,
        }),
      ).rejects.toThrow('Memory content exceeds 2,000 token limit');
    });

    it('does not throw for content of exactly 8000 characters', async () => {
      const result = await manager.create(agentId, {
        title: 'Edge Case',
        content: 'x'.repeat(8000),
        type: 'project',
        projectId,
      });
      expect(result.memory.id).toBeDefined();
    });

    it('returns needsConsolidation=false when under threshold', async () => {
      const result = await manager.create(agentId, {
        title: 'Normal',
        content: 'content',
        type: 'project',
        projectId,
      });
      expect(result.needsConsolidation).toBe(false);
    });
  });

  describe('readOwn', () => {
    it('returns all memories belonging to the agent', async () => {
      await manager.create(agentId, { title: 'A', content: 'a', type: 'project', projectId });
      await manager.create(agentId, { title: 'B', content: 'b', type: 'decision', projectId });
      await manager.create(agentId2, { title: 'C', content: 'c', type: 'project', projectId }); // other agent

      const own = await manager.readOwn(agentId);
      expect(own).toHaveLength(2);
      expect(own.every((m) => m.agentId === agentId)).toBe(true);
    });

    it('filters by projectId when provided — includes both project-scoped and global', async () => {
      await manager.create(agentId, { title: 'Global', content: 'g', type: 'pattern', projectId: null });
      await manager.create(agentId, { title: 'Proj', content: 'p', type: 'project', projectId });
      // 'Other' would need a different project FK reference — skip to avoid FK error

      const own = await manager.readOwn(agentId, projectId);
      const titles = own.map((m) => m.title);
      expect(titles).toContain('Global'); // global memories included
      expect(titles).toContain('Proj');   // project-scoped included
    });

    it('returns empty array when agent has no memories', async () => {
      const own = await manager.readOwn(agentId);
      expect(own).toEqual([]);
    });
  });

  describe('readShared', () => {
    it('returns project/decision memories from other agents', async () => {
      await manager.create(agentId2, { title: 'Shared Decision', content: 'x', type: 'decision', projectId });
      await manager.create(agentId2, { title: 'Shared Project', content: 'y', type: 'project', projectId });
      await manager.create(agentId2, { title: 'Private Pattern', content: 'z', type: 'pattern', projectId }); // type excluded

      const shared = await manager.readShared(agentId, projectId);
      const titles = shared.map((m) => m.title);
      expect(titles).toContain('Shared Decision');
      expect(titles).toContain('Shared Project');
      expect(titles).not.toContain('Private Pattern');
    });

    it('excludes own agent memories', async () => {
      await manager.create(agentId, { title: 'Own Memory', content: 'x', type: 'decision', projectId });
      const shared = await manager.readShared(agentId, projectId);
      expect(shared.map((m) => m.title)).not.toContain('Own Memory');
    });

    it('excludes memories that have no project association', async () => {
      // Global memories (null projectId) are excluded from readShared since it filters by projectId
      await manager.create(agentId2, { title: 'Global Only', content: 'x', type: 'decision', projectId: null });
      const shared = await manager.readShared(agentId, projectId);
      // readShared requires eq(memories.projectId, projectId) — global (null) excluded
      expect(shared.map((m) => m.title)).not.toContain('Global Only');
    });
  });

  describe('update', () => {
    it('updates memory content by owner', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'Original',
        content: 'Old content',
        type: 'project',
        projectId,
      });

      await manager.update(agentId, memory.id, { content: 'Updated content' });

      const own = await manager.readOwn(agentId);
      const updated = own.find((m) => m.id === memory.id);
      expect(updated!.content).toBe('Updated content');
    });

    it('throws when non-owner tries to update', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'Owned',
        content: 'content',
        type: 'project',
        projectId,
      });

      await expect(
        manager.update(agentId2, memory.id, { content: 'Hacked' }),
      ).rejects.toThrow('Memory not found or access denied');
    });

    it('throws when memory does not exist', async () => {
      await expect(
        manager.update(agentId, 'nonexistent-id', { title: 'x' }),
      ).rejects.toThrow('Memory not found or access denied');
    });
  });

  describe('delete', () => {
    it('deletes memory by owner', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'To Delete',
        content: 'x',
        type: 'project',
        projectId,
      });

      await manager.delete(agentId, memory.id);
      const own = await manager.readOwn(agentId);
      expect(own.find((m) => m.id === memory.id)).toBeUndefined();
    });

    it('throws when non-owner tries to delete', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'Owned',
        content: 'content',
        type: 'project',
        projectId,
      });

      await expect(
        manager.delete(agentId2, memory.id),
      ).rejects.toThrow('Memory not found or access denied');
    });

    it('throws when memory does not exist', async () => {
      await expect(
        manager.delete(agentId, 'nonexistent-id'),
      ).rejects.toThrow('Memory not found or access denied');
    });
  });

  describe('forceUpdate (operator override)', () => {
    it('updates memory regardless of ownership', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'Owned By Agent1',
        content: 'original',
        type: 'project',
        projectId,
      });

      await manager.forceUpdate(memory.id, { content: 'overridden by operator' });

      const own = await manager.readOwn(agentId);
      const updated = own.find((m) => m.id === memory.id);
      expect(updated!.content).toBe('overridden by operator');
    });
  });

  describe('forceDelete (operator override)', () => {
    it('deletes memory regardless of ownership', async () => {
      const { memory } = await manager.create(agentId, {
        title: 'To Force Delete',
        content: 'x',
        type: 'project',
        projectId,
      });

      await manager.forceDelete(memory.id);
      const own = await manager.readOwn(agentId);
      expect(own.find((m) => m.id === memory.id)).toBeUndefined();
    });
  });

  describe('checkMemoryCount', () => {
    it('returns false when agent has <= 100 memories', async () => {
      const result = await manager.checkMemoryCount(agentId);
      expect(result).toBe(false);
    });
  });
});
