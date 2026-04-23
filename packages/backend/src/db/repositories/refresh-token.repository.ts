import { eq, and, isNull } from 'drizzle-orm';
import { refreshTokens } from '../schema/refresh-tokens';
import type { RefreshTokenRow, NewRefreshTokenRow } from '../schema/refresh-tokens';
import type { DB } from '../index';

export class RefreshTokenRepository {
  constructor(private db: DB) {}

  async findByJti(jti: string): Promise<RefreshTokenRow | null> {
    return (
      this.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.jti, jti))
        .get() ?? null
    );
  }

  async create(data: NewRefreshTokenRow): Promise<void> {
    await this.db.insert(refreshTokens).values(data);
  }

  async revoke(jti: string, now: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.jti, jti), isNull(refreshTokens.revokedAt)));
  }

  async revokeAndReplace(
    jti: string,
    replacedBy: string,
    now: string,
  ): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now, replacedBy })
      .where(and(eq(refreshTokens.jti, jti), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string, now: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(
        and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
      );
  }
}
