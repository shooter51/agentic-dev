import type { AuthErrorCode } from '@agentic-dev/shared';

/**
 * Typed authentication error.
 *
 * All auth failures are surfaced as `AuthError` so route handlers can produce
 * a consistent machine-readable error envelope. Use the static factory methods
 * rather than constructing directly.
 *
 * @example Route handler
 * ```ts
 * try {
 *   const result = await fastify.auth.login(body);
 *   reply.send(result);
 * } catch (err) {
 *   if (err instanceof AuthError) {
 *     return reply.code(err.httpStatus).send(err.toBody());
 *   }
 *   throw err;
 * }
 * ```
 */
export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly httpStatus: number = 401,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }

  static invalidCredentials(): AuthError {
    return new AuthError('INVALID_CREDENTIALS', 'Invalid email or password');
  }

  static invalidRefreshToken(): AuthError {
    return new AuthError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
  }

  static invalidAccessToken(): AuthError {
    return new AuthError('INVALID_ACCESS_TOKEN', 'Invalid or expired access token');
  }

  static missingToken(): AuthError {
    return new AuthError('MISSING_TOKEN', 'Authentication required');
  }

  static insufficientRole(): AuthError {
    return new AuthError('INSUFFICIENT_ROLE', 'Insufficient role', 403);
  }

  static rateLimited(retryAfterSeconds: number): AuthError {
    return new AuthError('RATE_LIMITED', 'Too many login attempts', 429, retryAfterSeconds);
  }

  static invalidRequest(message: string): AuthError {
    return new AuthError('INVALID_REQUEST', message, 400);
  }

  /**
   * Serialises the error to the standard API error envelope.
   *
   * The envelope is `{ error: { code, message, retryAfterSeconds? } }`.
   * `retryAfterSeconds` is only included for `RATE_LIMITED` responses.
   */
  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.retryAfterSeconds !== undefined && {
          retryAfterSeconds: this.retryAfterSeconds,
        }),
      },
    };
  }
}
