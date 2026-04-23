import { eq, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { deliverables } from '../schema/deliverables';
import type { Deliverable, NewDeliverable } from '../schema/deliverables';
import type { DB } from '../index';

export class DeliverableRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Deliverable | null> {
    return this.db.select().from(deliverables).where(eq(deliverables.id, id)).get() ?? null;
  }

  async findByTask(taskId: string): Promise<Deliverable[]> {
    return this.db
      .select()
      .from(deliverables)
      .where(eq(deliverables.taskId, taskId))
      .orderBy(asc(deliverables.createdAt));
  }

  async findByTaskAndType(taskId: string, type: Deliverable['type']): Promise<Deliverable[]> {
    return this.db
      .select()
      .from(deliverables)
      .where(eq(deliverables.taskId, taskId))
      .orderBy(asc(deliverables.createdAt));
  }

  async create(data: Omit<NewDeliverable, 'id' | 'createdAt'>): Promise<Deliverable> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(deliverables).values({ id, ...data, createdAt: now });
    return (await this.findById(id))!;
  }
}
