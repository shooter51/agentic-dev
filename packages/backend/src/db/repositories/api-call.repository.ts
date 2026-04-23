import { eq, and, asc, sum } from 'drizzle-orm';
import { ulid } from 'ulid';
import { apiCalls } from '../schema/api-calls';
import type { ApiCall, NewApiCall } from '../schema/api-calls';
import type { DB } from '../index';

export class ApiCallRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<ApiCall | null> {
    return this.db.select().from(apiCalls).where(eq(apiCalls.id, id)).get() ?? null;
  }

  async findByAgent(agentId: string): Promise<ApiCall[]> {
    return this.db
      .select()
      .from(apiCalls)
      .where(eq(apiCalls.agentId, agentId))
      .orderBy(asc(apiCalls.createdAt));
  }

  async findByTask(taskId: string): Promise<ApiCall[]> {
    return this.db
      .select()
      .from(apiCalls)
      .where(eq(apiCalls.taskId, taskId))
      .orderBy(asc(apiCalls.createdAt));
  }

  async create(data: Omit<NewApiCall, 'id' | 'createdAt'>): Promise<ApiCall> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(apiCalls).values({ id, ...data, createdAt: now });
    return (await this.findById(id))!;
  }

  async getTokenSummaryByAgent(
    agentId: string,
  ): Promise<{ inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }> {
    const result = await this.db
      .select({
        inputTokens: sum(apiCalls.inputTokens),
        outputTokens: sum(apiCalls.outputTokens),
        cacheReadTokens: sum(apiCalls.cacheReadTokens),
        cacheWriteTokens: sum(apiCalls.cacheWriteTokens),
      })
      .from(apiCalls)
      .where(eq(apiCalls.agentId, agentId))
      .get();

    return {
      inputTokens: Number(result?.inputTokens ?? 0),
      outputTokens: Number(result?.outputTokens ?? 0),
      cacheReadTokens: Number(result?.cacheReadTokens ?? 0),
      cacheWriteTokens: Number(result?.cacheWriteTokens ?? 0),
    };
  }
}
