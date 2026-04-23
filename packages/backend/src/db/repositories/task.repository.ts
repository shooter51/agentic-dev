import { eq, and, asc, desc, isNull, notInArray, inArray, sql, notExists } from 'drizzle-orm';
import { ulid } from 'ulid';
import { tasks } from '../schema/tasks';
import type { Task, NewTask } from '../schema/tasks';
import type { DB } from '../index';

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const groupKey = String(item[key]);
      if (!acc[groupKey]) {
        acc[groupKey] = [];
      }
      acc[groupKey].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export class TaskRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<Task | null> {
    return this.db.select().from(tasks).where(eq(tasks.id, id)).get() ?? null;
  }

  async findByStage(projectId: string, stage: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.stage, stage as Task['stage'])))
      .orderBy(asc(tasks.priority), asc(tasks.createdAt));
  }

  async findReadyForDispatch(): Promise<Task[]> {
    const childDefects = this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.type, 'bug'),
          notInArray(tasks.stage, ['done', 'cancelled']),
        ),
      );

    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          notInArray(tasks.stage, ['todo', 'done', 'cancelled', 'deferred']),
          isNull(tasks.assignedAgent),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(childDefects.as('child_defects'))
              .where(sql`child_defects.parent_task_id = ${tasks.id}`),
          ),
        ),
      )
      .orderBy(
        asc(tasks.priority),
        desc(eq(tasks.type, 'bug')),
        asc(tasks.createdAt),
      );
  }

  async findChildDefects(parentTaskId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.parentTaskId, parentTaskId), eq(tasks.type, 'bug')));
  }

  async findSubTasks(parentTaskId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.parentTaskId, parentTaskId),
          inArray(tasks.type, ['feature', 'task']),
        ),
      );
  }

  async create(data: Omit<NewTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db.insert(tasks).values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async updateStage(id: string, stage: Task['stage'], agentId?: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ stage, assignedAgent: agentId ?? null, updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, id));
  }

  async getBoardView(projectId: string): Promise<Record<string, Task[]>> {
    const allTasks = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.priority), asc(tasks.createdAt));

    return groupBy(allTasks, 'stage');
  }
}
