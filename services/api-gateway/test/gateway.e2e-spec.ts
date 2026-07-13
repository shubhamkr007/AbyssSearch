import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AuthGuard } from '../src/auth/auth.guard';
import { CONFIG_CLIENT, FakeConfigClient } from '../src/clients/config.client';
import { FakeSearchClient, SEARCH_CLIENT } from '../src/clients/search.client';
import { RetryAfterInterceptor } from '../src/common/retry-after.interceptor';
import { APP_ENV, loadEnv } from '../src/config/env';
import { GatewayController } from '../src/gateway/gateway.controller';
import { GatewayService } from '../src/gateway/gateway.service';
import { HealthController } from '../src/health/health.controller';
import { MetricsService } from '../src/metrics/metrics.service';
import { RateLimitGuard } from '../src/ratelimit/rate-limit.guard';
import { InMemoryRateLimiter, RATE_LIMITER } from '../src/ratelimit/rate-limiter';

describe('API Gateway (e2e, fake downstreams)', () => {
  let app: INestApplication;
  const config = new FakeConfigClient();
  const search = new FakeSearchClient();

  beforeAll(async () => {
    config.keys.set('pk_search', {
      tenantId: 't_main',
      prefix: 'acme',
      scopes: ['search'],
      originAllowlist: [],
      rateLimit: 60,
    });
    config.keys.set('pk_noscope', {
      tenantId: 't_ns',
      prefix: 'acme',
      scopes: ['read'],
      originAllowlist: [],
      rateLimit: 60,
    });
    config.keys.set('pk_rl', {
      tenantId: 't_rl',
      prefix: 'acme',
      scopes: ['search'],
      originAllowlist: [],
      rateLimit: 1,
    });
    config.configs.set('t_main', {
      tenant: { id: 't_main', name: 'Acme', prefix: 'acme', status: 'active' },
      tabs: [{ tabKey: 'all', label: 'All', enabled: true, position: 0 }],
      searchConfig: { synonyms: [], boosts: {}, facets: ['tags'], suggestConfig: {} },
    });
    config.configs.set('t_ns', {
      tenant: { id: 't_ns', name: 'NoScope', prefix: 'acme', status: 'active' },
      tabs: [],
      searchConfig: { synonyms: [], boosts: {}, facets: [], suggestConfig: {} },
    });
    search.searchResponse = {
      query: '',
      tab: 'all',
      total: 1,
      page: 1,
      size: 10,
      hybridMode: 'client_rrf',
      degraded: false,
      results: [
        { id: 'd1', score: 0.9, title: 'Doc', snippet: 's', url: 'u', tags: ['x'], source: 'document' },
      ],
      facets: { tags: [{ value: 'x', count: 1 }] },
      didYouMean: null,
      timings: { embedMs: 0, esMs: 0, totalMs: 0 },
    };
    search.suggestResponse = { query: '', suggestions: ['reset password'] };

    const moduleRef = await Test.createTestingModule({
      controllers: [GatewayController, HealthController],
      providers: [
        { provide: APP_ENV, useValue: { ...loadEnv(), useFake: true } },
        { provide: CONFIG_CLIENT, useValue: config },
        { provide: SEARCH_CLIENT, useValue: search },
        { provide: RATE_LIMITER, useValue: new InMemoryRateLimiter() },
        { provide: APP_INTERCEPTOR, useClass: RetryAfterInterceptor },
        MetricsService,
        GatewayService,
        AuthGuard,
        RateLimitGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

  it('liveness is open', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('rejects unauthenticated search with 401', async () => {
    await request(app.getHttpServer()).post('/v1/search').send({ query: 'hi' }).expect(401);
  });

  it('returns shaped search results for a valid key', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/search')
      .set(bearer('pk_search'))
      .send({ query: 'hello', tab: 'all' })
      .expect(200);
    expect(res.body.results[0].id).toBe('d1');
    expect(res.body.query).toBe('hello');
    expect(res.headers['x-ratelimit-limit']).toBe('60');
  });

  it('validates the search body', async () => {
    await request(app.getHttpServer())
      .post('/v1/search')
      .set(bearer('pk_search'))
      .send({ tab: 'all' })
      .expect(400);
  });

  it('enforces scopes (search route needs the search scope)', async () => {
    await request(app.getHttpServer())
      .post('/v1/search')
      .set(bearer('pk_noscope'))
      .send({ query: 'hello' })
      .expect(403);
  });

  it('allows config with any valid key (no scope required)', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/config')
      .set(bearer('pk_noscope'))
      .expect(200);
    expect(res.body.prefix).toBe('acme');
  });

  it('serves suggestions', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/suggest')
      .query({ q: 'reset' })
      .set(bearer('pk_search'))
      .expect(200);
    expect(res.body.suggestions).toContain('reset password');
  });

  it('rate-limits per tenant (429 + Retry-After)', async () => {
    await request(app.getHttpServer()).post('/v1/search').set(bearer('pk_rl')).send({ query: 'a' }).expect(200);
    const res = await request(app.getHttpServer())
      .post('/v1/search')
      .set(bearer('pk_rl'))
      .send({ query: 'a' })
      .expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('answers route is 501 in Phase 1 (needs rag scope first)', async () => {
    // pk_search lacks the rag scope -> 403 before reaching the 501 stub.
    await request(app.getHttpServer()).post('/v1/answers').set(bearer('pk_search')).send({}).expect(403);
  });

  it('maps search outage to 503 with Retry-After', async () => {
    search.fail = true;
    const res = await request(app.getHttpServer())
      .post('/v1/search')
      .set(bearer('pk_search'))
      .send({ query: 'hello' })
      .expect(503);
    expect(res.headers['retry-after']).toBeDefined();
    search.fail = false;
  });
});
