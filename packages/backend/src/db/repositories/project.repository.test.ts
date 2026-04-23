import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectRepository } from './project.repository.js';
import { createTestDb, seedBasicEntities, type TestDB } from '../test-helpers.js';

describe('ProjectRepository', () => {
  let db: TestDB;
  let repo: ProjectRepository;

  beforeEach(async () => {
    db = createTestDb();
    await seedBasicEntities(db);
    repo = new ProjectRepository(db as any);
  });

  describe('findById', () => {
    it('returns the project when found', async () => {
      const project = await repo.findById('proj-1');
      expect(project).not.toBeNull();
      expect(project!.name).toBe('Test Project');
      expect(project!.path).toBe('/repo');
    });

    it('returns null when not found', async () => {
      const project = await repo.findById('nonexistent');
      expect(project).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns all projects ordered by name', async () => {
      await repo.create({ name: 'Alpha', path: '/alpha', config: null });
      await repo.create({ name: 'Zeta', path: '/zeta', config: null });

      const all = await repo.findAll();
      expect(all.length).toBe(3); // seed + 2
      expect(all[0].name).toBe('Alpha');
      expect(all[1].name).toBe('Test Project');
      expect(all[2].name).toBe('Zeta');
    });
  });

  describe('findByPath', () => {
    it('returns the project matching the given path', async () => {
      const project = await repo.findByPath('/repo');
      expect(project).not.toBeNull();
      expect(project!.id).toBe('proj-1');
      expect(project!.name).toBe('Test Project');
    });

    it('returns null when no project matches the path', async () => {
      const project = await repo.findByPath('/nonexistent');
      expect(project).toBeNull();
    });

    it('matches exact path only', async () => {
      await repo.create({ name: 'Sub', path: '/repo/sub', config: null });

      const exact = await repo.findByPath('/repo');
      expect(exact).not.toBeNull();
      expect(exact!.id).toBe('proj-1');

      const sub = await repo.findByPath('/repo/sub');
      expect(sub).not.toBeNull();
      expect(sub!.name).toBe('Sub');

      const partial = await repo.findByPath('/rep');
      expect(partial).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a project with generated id and timestamps', async () => {
      const project = await repo.create({ name: 'New', path: '/new', config: null });
      expect(project.id).toBeDefined();
      expect(project.id.length).toBeGreaterThan(0);
      expect(project.name).toBe('New');
      expect(project.path).toBe('/new');
      expect(project.config).toBeNull();
      expect(project.createdAt).toBeDefined();
      expect(project.updatedAt).toBeDefined();
    });

    it('stores config when provided', async () => {
      const cfg = '{"qualityGates":{}}';
      const project = await repo.create({ name: 'Cfg', path: '/cfg', config: cfg });
      expect(project.config).toBe(cfg);
    });
  });

  describe('update', () => {
    it('updates name and returns updated project', async () => {
      const updated = await repo.update('proj-1', { name: 'Renamed' });
      expect(updated.name).toBe('Renamed');
      expect(updated.path).toBe('/repo');
    });

    it('updates path', async () => {
      const updated = await repo.update('proj-1', { path: '/new-repo' });
      expect(updated.path).toBe('/new-repo');
    });

    it('updates config', async () => {
      const updated = await repo.update('proj-1', { config: '{"x":1}' });
      expect(updated.config).toBe('{"x":1}');
    });

    it('updates updatedAt timestamp', async () => {
      const before = await repo.findById('proj-1');
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      const updated = await repo.update('proj-1', { name: 'Later' });
      expect(updated.updatedAt).not.toBe(before!.updatedAt);
    });
  });
});
