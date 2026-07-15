import { randomUUID } from 'node:crypto';

import { Module, type Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthGuard } from './auth/auth.guard';
import {
  CachedConfigClient,
  CONFIG_CLIENT,
  type ConfigClient,
  FakeConfigClient,
  HttpConfigClient,
} from './clients/config.client';
import {
  FakeSearchClient,
  HttpSearchClient,
  SEARCH_CLIENT,
  type SearchClient,
} from './clients/search.client';
import { RetryAfterInterceptor } from './common/retry-after.interceptor';
import { APP_ENV, type AppEnv, loadEnv } from './config/env';
import { GatewayController } from './gateway/gateway.controller';
import { GatewayService } from './gateway/gateway.service';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { RateLimitGuard } from './ratelimit/rate-limit.guard';
import { InMemoryRateLimiter, RATE_LIMITER } from './ratelimit/rate-limiter';

const env = loadEnv();

function seededFakeConfig(): ConfigClient {
  const client = new FakeConfigClient();
  const ctx = {
    tenantId: 'demo-tenant',
    prefix: 'demo',
    scopes: ['search'],
    originAllowlist: [],
    rateLimit: env.rateLimitDefault,
  };
  client.keys.set('pk_test_demo', ctx);
  client.configs.set('demo-tenant', {
    tenant: { id: 'demo-tenant', name: 'Demo', prefix: 'demo', status: 'active' },
    tabs: [
      { tabKey: 'all', label: 'All', enabled: true, position: 0 },
      { tabKey: 'documents', label: 'Documents', enabled: true, position: 1 },
    ],
    searchConfig: { synonyms: [], boosts: {}, facets: ['tags', 'source'], suggestConfig: {} },
  });
  return client;
}

function seededFakeSearch(): SearchClient {
  const client = new FakeSearchClient();
  client.searchResponse = {
    query: '',
    tab: 'all',
    total: 1,
    page: 1,
    size: 10,
    hybridMode: 'client_rrf',
    degraded: false,
    results: [
      {
        id: 'demo-1',
        score: 0.91,
        title: 'Demo result',
        snippet: 'A sample hit returned by the fake search client.',
        url: 'https://example.com/demo',
        tags: ['demo'],
        source: 'document',
      },
    ],
    facets: { tags: [{ value: 'demo', count: 1 }] },
    didYouMean: null,
    timings: { embedMs: 0, esMs: 0, totalMs: 0 },
  };
  client.suggestResponse = { query: '', suggestions: ['demo suggestion'] };
  return client;
}

const configProvider: Provider = env.useFakeConfig
  ? { provide: CONFIG_CLIENT, useFactory: seededFakeConfig }
  : {
      provide: CONFIG_CLIENT,
      useFactory: (e: AppEnv) =>
        new CachedConfigClient(
          new HttpConfigClient(e.configServiceUrl, e.downstreamTimeoutMs),
          e.keyCacheTtlSeconds * 1000,
          e.configCacheTtlSeconds * 1000,
        ),
      inject: [APP_ENV],
    };

const searchProvider: Provider = env.useFakeSearch
  ? { provide: SEARCH_CLIENT, useFactory: seededFakeSearch }
  : {
      provide: SEARCH_CLIENT,
      useFactory: (e: AppEnv) => new HttpSearchClient(e.searchServiceUrl, e.downstreamTimeoutMs),
      inject: [APP_ENV],
    };

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env.logLevel,
        genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers["x-api-key"]'],
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
  ],
  controllers: [GatewayController, HealthController, MetricsController],
  providers: [
    { provide: APP_ENV, useValue: env },
    configProvider,
    searchProvider,
    { provide: RATE_LIMITER, useClass: InMemoryRateLimiter },
    { provide: APP_INTERCEPTOR, useClass: RetryAfterInterceptor },
    MetricsService,
    GatewayService,
    AuthGuard,
    RateLimitGuard,
  ],
})
export class AppModule {}
