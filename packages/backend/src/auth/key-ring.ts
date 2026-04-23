import * as jose from 'jose';
import type { AuthConfig } from './config.js';

export interface VerifyResult {
  payload: jose.JWTPayload;
  kid: string;
}

export class KeyRing {
  private readonly secretKeys: Record<string, Uint8Array>;

  constructor(private readonly cfg: AuthConfig) {
    this.secretKeys = {};
    for (const [kid, buf] of Object.entries(cfg.keys)) {
      this.secretKeys[kid] = new Uint8Array(buf);
    }
  }

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

  async verify(token: string, opts: { aud: string }): Promise<VerifyResult> {
    const { protectedHeader } = jose.decodeProtectedHeader(token)
      ? { protectedHeader: jose.decodeProtectedHeader(token) }
      : { protectedHeader: { kid: undefined } };

    const kid = protectedHeader.kid;
    if (!kid || !this.secretKeys[kid]) {
      throw new Error('Unknown or missing kid in token header');
    }

    const { payload } = await jose.jwtVerify(token, this.secretKeys[kid], {
      issuer: this.cfg.issuer,
      audience: opts.aud,
      clockTolerance: this.cfg.clockSkewSeconds,
    });

    return { payload, kid };
  }
}
