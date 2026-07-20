export const APP_ENV = 'APP_ENV';

export interface AppEnv {
  port: number;
  configServiceUrl: string;
  searchServiceUrl: string;
  ragServiceUrl: string;
  redisUrl: string;

  rateLimitDefault: number;
  corsStrict: boolean;
  configCacheTtlSeconds: number;
  keyCacheTtlSeconds: number;
  downstreamTimeoutMs: number;
  /** Longer timeout for RAG (LLM generation is much slower than search/config). */
  ragTimeoutMs: number;

  logLevel: string;
  ragEnabled: boolean;

  /** Dev/test: use in-memory fake downstream clients (no Config/Search needed). */
  useFake: boolean;
  /** Fake only the Config/keys client (default: useFake). Lets you run real search with seeded config. */
  useFakeConfig: boolean;
  /** Fake only the Search client (default: useFake). */
  useFakeSearch: boolean;
  /** Fake only the RAG client (default: useFake). */
  useFakeRag: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadEnv(): AppEnv {
  const useFake = bool(process.env.USE_FAKE, false);
  return {
    port: num(process.env.PORT, 3000),
    configServiceUrl: process.env.CONFIG_SERVICE_URL ?? 'http://localhost:8000',
    searchServiceUrl: process.env.SEARCH_SERVICE_URL ?? 'http://localhost:8080',
    ragServiceUrl: process.env.RAG_SERVICE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',

    rateLimitDefault: num(process.env.RATE_LIMIT_DEFAULT, 60),
    corsStrict: bool(process.env.CORS_STRICT, false),
    configCacheTtlSeconds: num(process.env.CONFIG_CACHE_TTL_SECONDS, 30),
    keyCacheTtlSeconds: num(process.env.KEY_CACHE_TTL_SECONDS, 30),
    downstreamTimeoutMs: num(process.env.DOWNSTREAM_TIMEOUT_MS, 3000),
    ragTimeoutMs: num(process.env.RAG_TIMEOUT_MS, 60000),

    logLevel: process.env.LOG_LEVEL ?? 'info',
    ragEnabled: bool(process.env.RAG_ENABLED, false),

    useFake,
    useFakeConfig: bool(process.env.USE_FAKE_CONFIG, useFake),
    useFakeSearch: bool(process.env.USE_FAKE_SEARCH, useFake),
    useFakeRag: bool(process.env.USE_FAKE_RAG, useFake),
  };
}
