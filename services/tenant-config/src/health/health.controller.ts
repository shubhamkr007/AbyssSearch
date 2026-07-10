import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import {
  CACHE_PUBLISHER,
  type CachePublisher,
} from '../cache/cache.publisher';
import {
  TENANT_REPOSITORY,
  type TenantRepository,
} from '../domain/repository';

@Controller()
export class HealthController {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(CACHE_PUBLISHER) private readonly cache: CachePublisher,
  ) {}

  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, cache] = await Promise.all([
      this.repo.ping().catch(() => false),
      this.cache.ping().catch(() => false),
    ]);
    // Postgres is required for readiness; Valkey is best-effort (writes still
    // succeed without it, invalidation is just delayed to the consumer TTL).
    const ready = database;
    res.status(ready ? 200 : 503);
    return {
      status: ready ? 'ok' : 'unavailable',
      checks: { database, cache },
    };
  }
}
