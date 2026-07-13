export const RATE_LIMITER = 'RATE_LIMITER';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
}

export interface RateLimiter {
  hit(key: string, limitPerWindow: number): Promise<RateLimitResult>;
}

/**
 * Fixed-window per-key limiter. Adequate for a single instance; the production
 * upgrade is a Valkey-backed store (shared counters across gateway replicas),
 * which this interface allows swapping in without touching the guard.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; windowStart: number }>();

  constructor(private readonly windowMs = 60_000) {}

  async hit(key: string, limitPerWindow: number): Promise<RateLimitResult> {
    const now = Date.now();
    let window = this.windows.get(key);
    if (!window || now - window.windowStart >= this.windowMs) {
      window = { count: 0, windowStart: now };
      this.windows.set(key, window);
    }
    window.count += 1;
    const allowed = window.count <= limitPerWindow;
    return {
      allowed,
      limit: limitPerWindow,
      remaining: Math.max(0, limitPerWindow - window.count),
      resetMs: window.windowStart + this.windowMs - now,
    };
  }
}
