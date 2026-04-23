import { eq, and, ne, inArray, sql, or, isNull } from 'drizzle-orm';
import { ulid } from 'ulid';
import { memories } from '../db/schema/memories';
import type { DB } from '../db';
import type { Memory, CreateMemoryInput, UpdateMemoryInput } from '@agentic-dev/shared';

export interface CreateResult {
  memory: Memory;
  needsConsolidation: boolean;
}

export class MemoryManager {
  constructor(private db: DB) {}

  async create(agentId: string, data: CreateMemoryInput): Promise<CreateResult> {
    if (data.content.length > 8000) {
      throw new Error('Memory content exceeds 2,000 token limit');
    }

    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(memories).values({
      id,
      agentId,
      projectId: data.projectId ?? null,
      type: data.type,
      title: data.title,
      content: data.content,
      createdAt: now,
      updatedAt: now,
    });

    const needsConsolidation = await this.checkMemoryCount(agentId);
    const memory = this.db.select().from(memories).where(eq(memories.id, id)).get()!;
    return { memory, needsConsolidation };
  }

  async readOwn(agentId: string, projectId?: string): Promise<Memory[]> {
    const conditions = [eq(memories.agentId, agentId)];
    if (projectId) {
      conditions.push(
        or(eq(memories.projectId, projectId), isNull(memories.projectId))!
      );
    }
    return this.db.select().from(memories).where(and(...conditions));
  }

  async readShared(agentId: string, projectId: string): Promise<Memory[]> {
    return this.db.select().from(memories).where(and(
      ne(memories.agentId, agentId),
      eq(memories.projectId, projectId),
      inArray(memories.type, ['project', 'decision']),
    ));
  }

  async update(agentId: string, memoryId: string, data: UpdateMemoryInput): Promise<void> {
    const memory = this.db.select().from(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.agentId, agentId)))
      .get();

    if (!memory) {
      throw new Error('Memory not found or access denied');
    }

    await this.db.update(memories).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(memories.id, memoryId));
  }

  async delete(agentId: string, memoryId: string): Promise<void> {
    const memory = this.db.select().from(memories)
      .where(and(eq(memories.id, memoryId), eq(memories.agentId, agentId)))
      .get();

    if (!memory) {
      throw new Error('Memory not found or access denied');
    }

    await this.db.delete(memories).where(eq(memories.id, memoryId));
  }

  /** Operator override — bypasses ownership check */
  async forceUpdate(memoryId: string, data: UpdateMemoryInput): Promise<void> {
    await this.db.update(memories).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(memories.id, memoryId));
  }

  /** Operator override — bypasses ownership check */
  async forceDelete(memoryId: string): Promise<void> {
    await this.db.delete(memories).where(eq(memories.id, memoryId));
  }

  async checkMemoryCount(agentId: string): Promise<boolean> {
    const result = this.db
      .select({ count: sql<number>`count(*)` })
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .get();

    return result != null && result.count > 100;
  }
}
