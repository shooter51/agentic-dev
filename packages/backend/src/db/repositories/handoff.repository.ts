import { eq, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { handoffs } from '../schema/handoffs';
import type { Handoff, NewHandoff } from '../schema/handoffs';
import type { DB } from '../index';

export class HandoffRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Handoff | null> {
    return this.db.select().from(handoffs).where(eq(handoffs.id, id)).get() ?? null;
  }

  async findByTask(taskId: string): Promise<Handoff[]> {
    return this.db
      .select()
      .from(handoffs)
      .where(eq(handoffs.taskId, taskId))
      .orderBy(asc(handoffs.createdAt));
  }

  async findLatestByTask(taskId: string): Promise<Handoff | null> {
    const results = await this.db
      .select()
      .from(handoffs)
      .where(eq(handoffs.taskId, taskId))
      .orderBy(asc(handoffs.createdAt));
    return results[results.length - 1] ?? null;
  }

  async create(data: Omit<NewHandoff, 'id' | 'createdAt'>): Promise<Handoff> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(handoffs).values({ id, ...data, createdAt: now });
    return (await this.findById(id))!;
  }
}
