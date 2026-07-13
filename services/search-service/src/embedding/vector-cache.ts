/**
 * Tiny in-process LRU for query vectors. Query embedding is the main additive
 * latency in hybrid search, so caching repeated/short queries pays off. Bounded
 * by insertion-order eviction (Map preserves order).
 */
export class VectorCache {
  private readonly map = new Map<string, number[]>();

  constructor(private readonly max: number) {}

  get(key: string): number[] | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      // Refresh recency.
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: string, value: number[]): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
