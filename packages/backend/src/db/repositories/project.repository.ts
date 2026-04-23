import { eq, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { projects } from '../schema/projects';
import type { Project, NewProject } from '../schema/projects';
import type { DB } from '../index';

export class ProjectRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Project | null> {
    return this.db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
  }

  async findAll(): Promise<Project[]> {
    return this.db.select().from(projects).orderBy(asc(projects.name));
  }

  async findByPath(path: string): Promise<Project | null> {
    return this.db.select().from(projects).where(eq(projects.path, path)).get() ?? null;
  }

  async create(data: Omit<NewProject, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(projects).values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async update(
    id: string,
    data: Partial<Pick<Project, 'name' | 'path' | 'config'>>,
  ): Promise<Project> {
    await this.db
      .update(projects)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(projects.id, id));
    return (await this.findById(id))!;
  }
}
