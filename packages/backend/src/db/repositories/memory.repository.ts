import { eq, and, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { memories } from '../schema/memories';
import type { Memory, NewMemory } from '../schema/memories';
import type { DB } from '../index';

export class MemoryRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Memory | null> {
    return this.db.select().from(memories).where(eq(memories.id, id)).get() ?? null;
  }

  async findByAgent(agentId: string): Promise<Memory[]> {
    return this.db
      .select()
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .orderBy(asc(memories.createdAt));
  }

  async findByAgentAndProject(agentId: string, projectId: string): Promise<Memory[]> {
    return this.db
      .select()
      .from(memories)
      .where(and(eq(memories.agentId, agentId), eq(memories.projectId, projectId)))
      .orderBy(asc(memories.createdAt));
  }

  async create(data: Omit<NewMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(memories).values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async update(id: string, data: Partial<Pick<Memory, 'title' | 'content'>>): Promise<Memory> {
    await this.db
      .update(memories)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(memories.id, id));
    return (await this.findById(id))!;
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(memories).where(eq(memories.id, id));
  }
}
