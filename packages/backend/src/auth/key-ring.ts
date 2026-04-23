import * as jose from 'jose';
import type { AuthConfig } from './config.js';

export interface VerifyResult {
  payload: jose.JWTPayload;
  kid: string;
}

/**
 * Multi-key JWT ring that supports zero-downtime key rotation.
 *
 * All keys listed in `AuthConfig.keys` are active verifiers, but only the key
 * identified by `AuthConfig.currentKid` is used for signing new tokens. This
 * lets you introduce a new signing key and retire an old one without
 * invalidating tokens that are still within their TTL.
 *
 * Algorithm: HS256 (HMAC-SHA256). All secrets must be ≥ 256 bits (32 bytes).
 *
 * @example Rotation procedure
 * 1. Generate a new secret and add it under a new kid in `AUTH_JWT_KEYS`.
 * 2. Set `AUTH_CURRENT_KID` to the new kid and restart — new tokens now sign
 *    with the new key while old tokens (signed with the previous key) are still
 *    verifiable.
 * 3. After `AUTH_REFRESH_TTL_SECONDS` + clock-skew have elapsed (all old tokens
 *    have expired), remove the old kid from `AUTH_JWT_KEYS` and restart.
 *
 * See `docs/runbooks/auth-key-rotation.md` for the full procedure.
 */
export class KeyRing {
  private readonly secretKeys: Record<string, Uint8Array>;

  constructor(private readonly cfg: AuthConfig) {
    this.secretKeys = {};
    for (const [kid, buf] of Object.entries(cfg.keys)) {
      this.secretKeys[kid] = new Uint8Array(buf);
    }
  }

  /**
   * Signs a JWT with the current key.
   *
   * Sets `iat`, `iss`, `aud`, and `exp` automatically. The `kid` header field
   * is set to `cfg.currentKid` so {@link verify} can select the right key.
   *
   * @param payload - Additional claims to embed (e.g. `sub`, `roles`, `jti`, `typ`).
   * @param opts.aud - Audience claim. Use distinct values for access vs refresh
   *   tokens to prevent token-confusion attacks.
   * @param opts.ttlSeconds - Lifetime in seconds from `iat`.
   */
  async sign(
    payload: Record<string, unknown>,
    opts: { aud: string; ttlSeconds: number },
  ): Promise<string> {
    const key = this.secretKeys[this.cfg.currentKid];
    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', kid: this.cfg.currentKid })
      .setIssuedAt()
      .setIssuer(this.cfg.issuer)
      .setAudience(opts.aud)
      .setExpirationTime(`${opts.ttlSeconds}s`)
      .sign(key);
  }

  /**
   * Verifies a JWT and returns its decoded payload.
   *
   * Selects the verification key from the `kid` header field. Tokens signed
   * with any key in `cfg.keys` are accepted — this is what makes rotation
   * non-breaking.
   *
   * @param opts.aud - Expected audience. Must match the token's `aud` claim
   *   exactly; mismatches are rejected to prevent token-confusion attacks.
   * @throws {Error} If the `kid` is missing or unknown, the signature is
   *   invalid, or any standard claim (`iss`, `aud`, `exp`) fails validation.
   */
  async verify(token: string, opts: { aud: string }): Promise<VerifyResult> {
    const { kid } = jose.decodeProtectedHeader(token);

    if (!kid || !this.secretKeys[kid]) {
      throw new Error('Unknown or missing kid in token header');
    }

    const { payload } = await jose.jwtVerify(token, this.secretKeys[kid], {
      algorithms: ['HS256'],
      issuer: this.cfg.issuer,
      audience: opts.aud,
      clockTolerance: this.cfg.clockSkewSeconds,
    });

    return { payload, kid };
  }
}
