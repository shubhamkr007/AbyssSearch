import type { AggregatedConfig, TenantContext } from '../domain/types';
import { httpJson } from './http';
import { TtlCache } from './ttl-cache';

export const CONFIG_CLIENT = 'CONFIG_CLIENT';

/** Distinguishes "config is down" from "key is invalid" (the latter is `null`). */
export class ConfigUnavailableError extends Error {
  constructor(message = 'config service unavailable') {
    super(message);
    this.name = 'ConfigUnavailableError';
  }
}

export interface ConfigClient {
  /** Resolves tenant context, `null` for an invalid/inactive key, throws on outage. */
  verifyKey(key: string, correlationId?: string): Promise<TenantContext | null>;
  getConfig(tenantId: string, correlationId?: string): Promise<AggregatedConfig>;
}

export class HttpConfigClient implements ConfigClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async verifyKey(key: string, correlationId?: string): Promise<TenantContext | null> {
    try {
      const res = await httpJson(this.url('/keys/verify'), {
        method: 'POST',
        body: { key },
        timeoutMs: this.timeoutMs,
        correlationId,
      });
      if (res.status === 200) return (await res.json()) as TenantContext;
      if (res.status === 401 || res.status === 403) return null;
      throw new ConfigUnavailableError(`verify returned ${res.status}`);
    } catch (err) {
      if (err instanceof ConfigUnavailableError) throw err;
      throw new ConfigUnavailableError((err as Error).message);
    }
  }

  async getConfig(tenantId: string, correlationId?: string): Promise<AggregatedConfig> {
    try {
      const res = await httpJson(this.url(`/tenants/${encodeURIComponent(tenantId)}/config`), {
        timeoutMs: this.timeoutMs,
        correlationId,
      });
      if (res.status === 200) return (await res.json()) as AggregatedConfig;
      throw new ConfigUnavailableError(`config returned ${res.status}`);
    } catch (err) {
      if (err instanceof ConfigUnavailableError) throw err;
      throw new ConfigUnavailableError((err as Error).message);
    }
  }
}

/** Wraps a ConfigClient with TTL caching + last-known-good (stale) fallback. */
export class CachedConfigClient implements ConfigClient {
  private readonly keyCache: TtlCache<TenantContext>;
  private readonly configCache: TtlCache<AggregatedConfig>;

  constructor(
    private readonly inner: ConfigClient,
    keyTtlMs: number,
    configTtlMs: number,
  ) {
    this.keyCache = new TtlCache(keyTtlMs);
    this.configCache = new TtlCache(configTtlMs);
  }

  async verifyKey(key: string, correlationId?: string): Promise<TenantContext | null> {
    const cached = this.keyCache.get(key);
    if (cached) return cached;
    try {
      const ctx = await this.inner.verifyKey(key, correlationId);
      if (ctx) this.keyCache.set(key, ctx);
      return ctx; // do not cache negative results (avoids lockout after a fix)
    } catch (err) {
      const stale = this.keyCache.getStale(key);
      if (stale) return stale;
      throw err;
    }
  }

  async getConfig(tenantId: string, correlationId?: string): Promise<AggregatedConfig> {
    const cached = this.configCache.get(tenantId);
    if (cached) return cached;
    try {
      const cfg = await this.inner.getConfig(tenantId, correlationId);
      this.configCache.set(tenantId, cfg);
      return cfg;
    } catch (err) {
      const stale = this.configCache.getStale(tenantId);
      if (stale) return stale;
      throw err;
    }
  }
}

/** In-memory client for tests / USE_FAKE dev mode. */
export class FakeConfigClient implements ConfigClient {
  readonly keys = new Map<string, TenantContext>();
  readonly configs = new Map<string, AggregatedConfig>();
  unavailable = false;

  async verifyKey(key: string): Promise<TenantContext | null> {
    if (this.unavailable) throw new ConfigUnavailableError();
    return this.keys.get(key) ?? null;
  }

  async getConfig(tenantId: string): Promise<AggregatedConfig> {
    if (this.unavailable) throw new ConfigUnavailableError();
    const cfg = this.configs.get(tenantId);
    if (!cfg) throw new ConfigUnavailableError('no config');
    return cfg;
  }
}
