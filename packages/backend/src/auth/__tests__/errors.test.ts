import { describe, it, expect } from 'vitest';
import { AuthError } from '../errors.js';

describe('AuthError', () => {
  it('invalidCredentials returns 401 with INVALID_CREDENTIALS code', () => {
    const err = AuthError.invalidCredentials();
    expect(err.code).toBe('INVALID_CREDENTIALS');
    expect(err.httpStatus).toBe(401);
    expect(err instanceof AuthError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('invalidRefreshToken returns 401 with INVALID_REFRESH_TOKEN code', () => {
    const err = AuthError.invalidRefreshToken();
    expect(err.code).toBe('INVALID_REFRESH_TOKEN');
    expect(err.httpStatus).toBe(401);
  });

  it('invalidAccessToken returns 401 with INVALID_ACCESS_TOKEN code', () => {
    const err = AuthError.invalidAccessToken();
    expect(err.code).toBe('INVALID_ACCESS_TOKEN');
    expect(err.httpStatus).toBe(401);
  });

  it('missingToken returns 401 with MISSING_TOKEN code', () => {
    const err = AuthError.missingToken();
    expect(err.code).toBe('MISSING_TOKEN');
    expect(err.httpStatus).toBe(401);
  });

  it('insufficientRole returns 403 with INSUFFICIENT_ROLE code', () => {
    const err = AuthError.insufficientRole();
    expect(err.code).toBe('INSUFFICIENT_ROLE');
    expect(err.httpStatus).toBe(403);
  });

  it('rateLimited returns 429 with RATE_LIMITED code and retryAfterSeconds', () => {
    const err = AuthError.rateLimited(42);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.httpStatus).toBe(429);
    expect(err.retryAfterSeconds).toBe(42);
  });

  it('invalidRequest returns 400 with INVALID_REQUEST code', () => {
    const err = AuthError.invalidRequest('bad payload');
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toBe('bad payload');
  });

  describe('toBody', () => {
    it('returns standard error envelope', () => {
      const err = AuthError.invalidCredentials();
      const body = err.toBody();
      expect(body).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: err.message,
        },
      });
    });

    it('includes retryAfterSeconds when set', () => {
      const err = AuthError.rateLimited(60);
      const body = err.toBody();
      expect(body.error.retryAfterSeconds).toBe(60);
    });

    it('omits retryAfterSeconds when not set', () => {
      const err = AuthError.invalidCredentials();
      const body = err.toBody();
      expect(body.error).not.toHaveProperty('retryAfterSeconds');
    });
  });

  it('name is AuthError', () => {
    const err = AuthError.invalidCredentials();
    expect(err.name).toBe('AuthError');
  });
});
