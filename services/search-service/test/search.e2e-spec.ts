import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { APP_ENV, loadEnv } from '../src/config/env';
import { EMBEDDING_CLIENT, FakeEmbeddingClient } from '../src/embedding/embedding.client';
import { HealthController } from '../src/health/health.controller';
import { SEARCH_BACKEND } from '../src/search/backend';
import { FakeSearchBackend } from '../src/search/fake.backend';
import { SearchController } from '../src/search/search.controller';
import { SearchService } from '../src/search/search.service';

describe('Search API (e2e, fake backend)', () => {
  let app: INestApplication;
  const backend = new FakeSearchBackend();
  const embedding = new FakeEmbeddingClient([0.1, 0.2]);

  beforeAll(async () => {
    backend.bm25 = {
      total: 2,
      hits: [
        { id: 'a', score: 0, source: { title: 'Alpha', body: 'alpha body', url: 'http://x/a' } },
        { id: 'b', score: 0, source: { title: 'Bravo' } },
      ],
      facets: { tags: [{ value: 'billing', count: 1 }] },
    };
    backend.knn = { total: 1, hits: [{ id: 'b', score: 0, source: {} }] };
    backend.suggest = {
      total: 1,
      hits: [{ id: '1', score: 0, source: { title: 'reset password' } }],
    };
    backend.didYouMean = { total: 0, hits: [], suggest: { dym: [{ text: 'elasticsearch', score: 1 }] } };

    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController, HealthController],
      providers: [
        { provide: APP_ENV, useValue: { ...loadEnv(), useFake: true } },
        { provide: SEARCH_BACKEND, useValue: backend },
        { provide: EMBEDDING_CLIENT, useValue: embedding },
        SearchService,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('liveness', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('POST /search returns fused, tenant-scoped results', async () => {
    const res = await request(app.getHttpServer())
      .post('/search')
      .send({ tenant: 'acme', q: 'hello', tab: 'all' })
      .expect(200);
    expect(res.body.hybridMode).toBe('client_rrf');
    expect(res.body.results[0].id).toBe('b');
    expect(res.body.facets.tags[0]).toEqual({ value: 'billing', count: 1 });
  });

  it('POST /search validates required fields', async () => {
    await request(app.getHttpServer()).post('/search').send({ tab: 'all' }).expect(400);
  });

  it('GET /suggest returns title suggestions', async () => {
    const res = await request(app.getHttpServer())
      .get('/suggest')
      .query({ tenant: 'acme', q: 'reset' })
      .expect(200);
    expect(res.body.suggestions).toContain('reset password');
  });

  it('POST /did-you-mean returns a correction', async () => {
    const res = await request(app.getHttpServer())
      .post('/did-you-mean')
      .send({ tenant: 'acme', q: 'elasticserch' })
      .expect(200);
    expect(res.body.didYouMean).toBe('elasticsearch');
  });
});
