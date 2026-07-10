import { randomUUID } from 'node:crypto';

import { Module, type Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { LoggerModule } from 'nestjs-pino';

import {
  CACHE_PUBLISHER,
  NoopCachePublisher,
  RedisCachePublisher,
} from './cache/cache.publisher';
import { AdminGuard } from './common/admin.guard';
import { APP_ENV, type AppEnv, loadEnv } from './config/env';
import { InMemoryTenantRepository } from './domain/in-memory.repository';
import { TENANT_REPOSITORY } from './domain/repository';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { PrismaTenantRepository } from './prisma/prisma.repository';
import { PrismaService } from './prisma/prisma.service';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';

const env = loadEnv();

const repositoryProvider: Provider = env.useInMemory
  ? { provide: TENANT_REPOSITORY, useClass: InMemoryTenantRepository }
  : { provide: TENANT_REPOSITORY, useClass: PrismaTenantRepository };

const infraProviders: Provider[] = env.useInMemory ? [] : [PrismaService];

const cacheProvider: Provider = {
  provide: CACHE_PUBLISHER,
  inject: [APP_ENV],
  useFactory: (e: AppEnv) => {
    if (!e.redisUrl) {
      return new NoopCachePublisher();
    }
    const client = new Redis(e.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Prevent connection errors from crashing the process; publishing is
    // best-effort and readiness reports cache health separately.
    client.on('error', () => undefined);
    return new RedisCachePublisher(client, e.configEventChannel);
  },
};

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.logLevel,
        genReqId: (req) =>
          (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        autoLogging: true,
        // Never emit credentials to logs.
        redact: {
          paths: ['req.headers.authorization', 'req.headers["x-admin-token"]'],
          remove: true,
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
  ],
  controllers: [TenantsController, HealthController, MetricsController],
  providers: [
    { provide: APP_ENV, useValue: env },
    ...infraProviders,
    repositoryProvider,
    cacheProvider,
    MetricsService,
    TenantsService,
    AdminGuard,
  ],
})
export class AppModule {}
