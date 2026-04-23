import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('hashPassword', () => {
  it('returns an argon2id hash string', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces different hashes for the same password (unique salts)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const pw = 'my-secure-password';
    const hash = await hashPassword(pw);
    const result = await verifyPassword(pw, hash);
    expect(result).toBe(true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });

  it('returns false when expectedHash is null (unknown user — timing-safe path)', async () => {
    const result = await verifyPassword('any-password', null);
    expect(result).toBe(false);
  });

  it('returns false for empty password against a valid hash', async () => {
    const hash = await hashPassword('non-empty');
    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });

  it('returns false for garbled hash string', async () => {
    const result = await verifyPassword('password', 'not-a-valid-argon2-hash');
    expect(result).toBe(false);
  });
});
