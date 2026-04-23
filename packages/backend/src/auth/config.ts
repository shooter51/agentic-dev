export interface AuthConfig {
  keys: Record<string, Buffer>;
  currentKid: string;
  issuer: string;
  audienceAccess: string;
  audienceRefresh: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  clockSkewSeconds: number;
  loginRateMax: number;
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
