import { eq, asc } from 'drizzle-orm';
import { agents } from '../schema/agents';
import type { Agent, NewAgent } from '../schema/agents';
import type { DB } from '../index';

export class AgentRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Agent | null> {
    return this.db.select().from(agents).where(eq(agents.id, id)).get() ?? null;
  }

  async findAll(): Promise<Agent[]> {
    return this.db.select().from(agents).orderBy(asc(agents.role));
  }

  async findByStatus(status: Agent['status']): Promise<Agent[]> {
    return this.db.select().from(agents).where(eq(agents.status, status));
  }

  async create(data: NewAgent): Promise<Agent> {
    await this.db.insert(agents).values(data).onConflictDoNothing();
    return (await this.findById(data.id))!;
  }

  async updateStatus(
    id: string,
    status: Agent['status'],
    currentTask?: string | null,
  ): Promise<void> {
    await this.db
      .update(agents)
      .set({
        status,
        currentTask: currentTask ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(agents.id, id));
  }
}
