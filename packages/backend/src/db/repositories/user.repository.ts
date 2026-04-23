import { eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { users } from '../schema/users';
import type { UserRow, NewUserRow } from '../schema/users';
import type { DB } from '../index';

export class UserRepository {
  constructor(private db: DB) {}

  async findById(id: string): Promise<UserRow | null> {
    return this.db.select().from(users).where(eq(users.id, id)).get() ?? null;
  }

  async findByEmail(email: string): Promise<UserRow | null> {
    return (
      this.db
        .select()
        .from(users)
        .where(eq(users.email, email.trim().toLowerCase()))
        .get() ?? null
    );
  }

  async create(
    data: Omit<NewUserRow, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<UserRow> {
    const id = ulid();
    const now = new Date().toISOString();
    await this.db
      .insert(users)
      .values({ id, ...data, createdAt: now, updatedAt: now });
    return (await this.findById(id))!;
  }

  async countAll(): Promise<number> {
    const rows = this.db.select().from(users).all();
    return rows.length;
  }
}
