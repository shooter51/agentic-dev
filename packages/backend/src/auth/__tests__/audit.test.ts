import { describe, it, expect, vi, type Mock } from 'vitest';
import { AuditWriter, hashEmail } from '../audit.js';
import type { AuthAuditRepository } from '../../db/repositories/auth-audit.repository.js';

function makeRepo(): { log: Mock } {
  return { log: vi.fn().mockResolvedValue(undefined) };
}

describe('hashEmail', () => {
  it('returns a hex string', () => {
    const result = hashEmail('test@example.com');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is consistent for same input', () => {
    expect(hashEmail('a@b.com')).toBe(hashEmail('a@b.com'));
  });

  it('lowercases before hashing', () => {
    expect(hashEmail('User@Example.com')).toBe(hashEmail('user@example.com'));
  });

  it('returns a 16-char truncated hash', () => {
    expect(hashEmail('test@example.com').length).toBe(16);
  });
});

describe('AuditWriter.log', () => {
  it('calls repo.log with correct event and fields', async () => {
    const repo = makeRepo();
    const writer = new AuditWriter(repo as unknown as AuthAuditRepository);
    await writer.log({
      event: 'login_success',
      userId: 'user-1',
      email: 'user@example.com',
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });
    expect(repo.log).toHaveBeenCalledOnce();
    const call = repo.log.mock.calls[0][0];
    expect(call.event).toBe('login_success');
    expect(call.userId).toBe('user-1');
    expect(call.emailHash).toBe(hashEmail('user@example.com'));
    expect(call.ip).toBe('127.0.0.1');
    expect(call.userAgent).toBe('Mozilla/5.0');
  });

  it('passes null for missing optional fields', async () => {
    const repo = makeRepo();
    const writer = new AuditWriter(repo as unknown as AuthAuditRepository);
    await writer.log({ event: 'logout' });
    const call = repo.log.mock.calls[0][0];
    expect(call.userId).toBeNull();
    expect(call.emailHash).toBeNull();
    expect(call.ip).toBeNull();
    expect(call.userAgent).toBeNull();
    expect(call.details).toBeNull();
  });

  it('serializes details as JSON string', async () => {
    const repo = makeRepo();
    const writer = new AuditWriter(repo as unknown as AuthAuditRepository);
    await writer.log({
      event: 'refresh_reuse_detected',
      details: { reusedJti: 'abc123' },
    });
    const call = repo.log.mock.calls[0][0];
    expect(JSON.parse(call.details)).toEqual({ reusedJti: 'abc123' });
  });

  it('handles all supported event types', async () => {
    const repo = makeRepo();
    const writer = new AuditWriter(repo as unknown as AuthAuditRepository);
    const events = [
      'login_success',
      'login_failure',
      'refresh',
      'refresh_reuse_detected',
      'logout',
      'token_rejected',
    ] as const;
    for (const event of events) {
      await writer.log({ event });
    }
    expect(repo.log).toHaveBeenCalledTimes(events.length);
  });
});
