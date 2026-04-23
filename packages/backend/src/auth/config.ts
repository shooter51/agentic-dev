/**
 * Resolved authentication configuration.
 *
 * Produced by {@link loadAuthConfig} from environment variables. All values
 * are validated at load time — the application will not start if required vars
 * are missing or secrets are too short.
 */
export interface AuthConfig {
  /** All signing/verification secrets indexed by key ID. */
  keys: Record<string, Buffer>;
  /** Key ID used to sign new tokens. Must be present in `keys`. */
  currentKid: string;
  /** `iss` claim embedded in every token. Default: `"agentic-dev"`. */
  issuer: string;
  /** `aud` claim for access tokens. Default: `"agentic-dev-api"`. */
  audienceAccess: string;
  /** `aud` claim for refresh tokens. Default: `"agentic-dev-refresh"`. */
  audienceRefresh: string;
  /** Access token lifetime in seconds. Default: `900` (15 min). */
  accessTtlSeconds: number;
  /** Refresh token lifetime in seconds. Default: `1209600` (14 days). */
  refreshTtlSeconds: number;
  /** Clock-skew tolerance for `exp`/`nbf` checks, in seconds. Default: `30`. */
  clockSkewSeconds: number;
  /** Max login attempts per rate-limit window per `(ip, emailHash)`. Default: `5`. */
  loginRateMax: number;
  /** Rate-limit window duration in seconds. Default: `900` (15 min). */
  loginRateWindowSeconds: number;
}

function requireEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const val = env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

/**
 * Loads and validates authentication configuration from environment variables.
 *
 * Called once during application bootstrap. Throws immediately if required
 * variables are absent or constraints are violated, preventing the server from
 * starting with an insecure configuration.
 *
 * Required variables:
 * - `AUTH_JWT_KEYS` — JSON object `{ "<kid>": "<base64-secret>", … }`.
 *   Every secret must decode to ≥ 32 bytes (256 bits).
 * - `AUTH_CURRENT_KID` — must be a key present in `AUTH_JWT_KEYS`.
 *
 * See `.env.example` for the full list of optional tuning variables.
 *
 * @param env - Override the environment source (useful in tests).
 * @throws {Error} If any required variable is missing or validation fails.
 */
export function loadAuthConfig(
  env: Record<string, string | undefined> = process.env,
): AuthConfig {
  const keysRaw = requireEnv('AUTH_JWT_KEYS', env);
  const keysObj = JSON.parse(keysRaw) as Record<string, string>;
  const keys: Record<string, Buffer> = {};
  for (const [kid, b64] of Object.entries(keysObj)) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 32) {
      throw new Error(`AUTH_JWT_KEYS[${kid}] must be >= 256 bits`);
    }
    keys[kid] = buf;
  }

  const currentKid = requireEnv('AUTH_CURRENT_KID', env);
  if (!keys[currentKid]) {
    throw new Error('AUTH_CURRENT_KID not present in AUTH_JWT_KEYS');
  }

  return {
    keys,
    currentKid,
    issuer: env['AUTH_ISSUER'] ?? 'agentic-dev',
    audienceAccess: env['AUTH_AUDIENCE_ACCESS'] ?? 'agentic-dev-api',
    audienceRefresh: env['AUTH_AUDIENCE_REFRESH'] ?? 'agentic-dev-refresh',
    accessTtlSeconds: Number(env['AUTH_ACCESS_TTL_SECONDS'] ?? 900),
    refreshTtlSeconds: Number(env['AUTH_REFRESH_TTL_SECONDS'] ?? 1209600),
    clockSkewSeconds: Number(env['AUTH_CLOCK_SKEW_SECONDS'] ?? 30),
    loginRateMax: Number(env['AUTH_LOGIN_RATE_MAX'] ?? 5),
    loginRateWindowSeconds: Number(env['AUTH_LOGIN_RATE_WINDOW_SECONDS'] ?? 900),
  };
}
