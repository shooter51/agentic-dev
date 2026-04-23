import { ulid } from 'ulid';
import { agents, users } from './schema';
import type { DB } from './index';

// Note: better-sqlite3 is synchronous under the hood, so Drizzle calls
// resolve immediately. The `await` keyword is harmless but technically
// unnecessary — kept for consistency with the async function signature.

export async function seedAgents(db: DB): Promise<void> {
  const agentSeeds = [
    { id: 'product-manager', role: 'Product Manager', model: 'opus' as const, status: 'idle' as const },
    { id: 'architect', role: 'Architect', model: 'opus' as const, status: 'idle' as const },
    { id: 'tech-lead', role: 'Tech Lead', model: 'opus' as const, status: 'idle' as const },
    { id: 'dev-1', role: 'Developer (Senior)', model: 'opus' as const, status: 'idle' as const },
    { id: 'dev-2', role: 'Developer', model: 'sonnet' as const, status: 'idle' as const },
    { id: 'dev-3', role: 'Developer', model: 'sonnet' as const, status: 'idle' as const },
    { id: 'devops', role: 'DevOps Engineer', model: 'sonnet' as const, status: 'idle' as const },
    { id: 'manual-qa', role: 'Manual QA', model: 'sonnet' as const, status: 'idle' as const },
    { id: 'automation', role: 'QA Automation Engineer', model: 'sonnet' as const, status: 'idle' as const },
    { id: 'documentation', role: 'Documentation Agent', model: 'sonnet' as const, status: 'idle' as const },
  ];

  for (const agent of agentSeeds) {
    await db
      .insert(agents)
      .values({
        ...agent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
  }
}

export async function seedOperatorUser(db: DB): Promise<void> {
  const email = process.env['OPERATOR_EMAIL'];
  const passwordHash = process.env['OPERATOR_PASSWORD_HASH'];

  if (!email || !passwordHash) {
    // Auth env vars not set — skip operator seeding (allows non-auth dev mode)
    return;
  }

  const existing = db.select().from(users).all();
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  await db.insert(users).values({
    id: ulid(),
    email: email.toLowerCase(),
    passwordHash,
    roles: JSON.stringify(['user', 'admin']),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
}
