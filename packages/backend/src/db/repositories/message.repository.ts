import { eq, and, asc } from 'drizzle-orm';
import { ulid } from 'ulid';
import { messages } from '../schema/messages';
import type { Message, NewMessage } from '../schema/messages';
import type { DB } from '../index';

export class MessageRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Message | null> {
    return this.db.select().from(messages).where(eq(messages.id, id)).get() ?? null;
  }

  async findByTask(taskId: string): Promise<Message[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.taskId, taskId))
      .orderBy(asc(messages.createdAt));
  }

  async findPendingForAgent(toAgent: string): Promise<Message[]> {
    return this.db
      .select()
      .from(messages)
      .where(and(eq(messages.toAgent, toAgent), eq(messages.status, 'pending')))
      .orderBy(asc(messages.createdAt));
  }

  async create(data: Omit<NewMessage, 'id' | 'createdAt'>): Promise<Message> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(messages).values({ id, ...data, createdAt: now });
    return (await this.findById(id))!;
  }

  async respond(id: string, response: string): Promise<void> {
    await this.db
      .update(messages)
      .set({
        response,
        status: 'completed',
        respondedAt: new Date().toISOString(),
      })
      .where(eq(messages.id, id));
  }

  async expire(id: string): Promise<void> {
    await this.db
      .update(messages)
      .set({ status: 'expired' })
      .where(eq(messages.id, id));
  }
}
