import argon2 from 'argon2';

const ARGON2_OPTS = {
  type: argon2.argon2id,
  timeCost: 3,
  memoryCost: 65536,
  parallelism: 4,
};

const DUMMY_HASH = await argon2.hash('x'.repeat(32), ARGON2_OPTS);

export async function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, ARGON2_OPTS);
}

export async function verifyPassword(
  pw: string,
  expectedHash: string | null,
): Promise<boolean> {
  const hash = expectedHash ?? DUMMY_HASH;
  try {
    const ok = await argon2.verify(hash, pw);
    return ok && expectedHash !== null;
  } catch {
    return false;
  }
}
