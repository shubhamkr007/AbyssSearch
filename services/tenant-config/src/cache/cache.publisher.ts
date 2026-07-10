import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';

export const CACHE_PUBLISHER = 'CACHE_PUBLISHER';

export interface InvalidationEvent {
  type:
    | 'tenant.updated'
    | 'tenant.created'
    | 'keys.changed'
    | 'tabs.updated'
    | 'search-config.updated'
    | 'sources.updated';
  tenantId: string;
}

/**
 * Publishes config-change events so downstream consumers (gateway, search
 * plane, workers) can invalidate their caches promptly.
 */
export interface CachePublisher {
  publishInvalidation(event: InvalidationEvent): Promise<void>;
  ping(): Promise<boolean>;
}

/** Used in tests and when Valkey is intentionally disabled. */
export class NoopCachePublisher implements CachePublisher {
  async publishInvalidation(): Promise<void> {
    /* no-op */
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

export class RedisCachePublisher implements CachePublisher {
  private readonly logger = new Logger(RedisCachePublisher.name);

  constructor(
    private readonly redis: Redis,
    private readonly channel: string,
  ) {}

  async publishInvalidation(event: InvalidationEvent): Promise<void> {
    // Cache invalidation is best-effort: a Valkey outage must not fail an
    // admin write. Consumers also use a short TTL as a safety net.
    try {
      await this.redis.publish(this.channel, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(
        `failed to publish invalidation event ${event.type}: ${(err as Error).message}`,
      );
    }
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
