interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Small TTL cache with an explicit stale read. The gateway caches key
 * verification and config lookups so a brief Config outage does not stop
 * search: `get` returns only fresh entries, `getStale` returns the last-known
 * value regardless of expiry for graceful degradation.
 */
export class TtlCache<V> {
  private readonly map = new Map<string, Entry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly max = 5000,
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) return undefined;
    return entry.value;
  }

  getStale(key: string): V | undefined {
    return this.map.get(key)?.value;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  delete(key: string): void {
    this.map.delete(key);
  }
}
