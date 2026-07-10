export const APP_ENV = 'APP_ENV';

export interface AppEnv {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  adminToken: string;
  configEventChannel: string;
  logLevel: string;
  /** When true, use the in-memory repository (dev/demo only; data is not persisted). */
  useInMemory: boolean;
  keyHashAlgo: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadEnv(): AppEnv {
  return {
    port: Number(process.env.PORT ?? 8000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? '',
    adminToken: process.env.ADMIN_TOKEN ?? '',
    configEventChannel: process.env.CONFIG_EVENT_CHANNEL ?? 'config:invalidate',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    useInMemory: bool(process.env.USE_IN_MEMORY, false),
    keyHashAlgo: process.env.API_KEY_HASH_ALGO ?? 'argon2id',
  };
}
