import { type AppEnv, loadEnv } from '../config/env';
import type { EsHit, JsonObject } from '../domain/types';
import { FakeEmbeddingClient } from '../embedding/embedding.client';
import { FakeSearchBackend } from './fake.backend';
import { SearchService } from './search.service';

const hit = (id: string, source: JsonObject = {}): EsHit => ({ id, score: 0, source });

function env(over: Partial<AppEnv> = {}): AppEnv {
  return { ...loadEnv(), ...over };
}

function build(over: Partial<AppEnv> = {}, vector: number[] | null = [0.1, 0.2]) {
  const backend = new FakeSearchBackend();
  const embedding = new FakeEmbeddingClient(vector);
  const service = new SearchService(backend, embedding, env(over));
  return { backend, embedding, service };
}

describe('SearchService.search', () => {
  it('runs hybrid client-side RRF and fuses both legs', async () => {
    const { backend, service } = build();
    backend.bm25 = {
      total: 2,
      hits: [hit('a', { title: 'Alpha', body: 'alpha body text' }), hit('b', { title: 'Bravo' })],
      facets: { tags: [{ value: 'x', count: 2 }] },
    };
    backend.knn = { total: 2, hits: [hit('b'), hit('c', { title: 'Charlie' })] };

    const res = await service.search({ tenant: 'acme', q: 'hello' });

    expect(res.hybridMode).toBe('client_rrf');
    expect(res.degraded).toBe(false);
    // b appears in both -> ranked first; then a, then c.
    expect(res.results.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(res.results.find((r) => r.id === 'a')?.snippet).toBe('alpha body text');
    expect(res.facets.tags).toEqual([{ value: 'x', count: 2 }]);
    // Total is the fused union of both legs (a, b, c) - not just the BM25 count.
    expect(res.total).toBe(3);
  });

  it('reports a non-zero total for a pure-semantic match (BM25 empty, kNN hits)', async () => {
    const { backend, service } = build();
    // No keyword matches, but the vector leg finds two docs.
    backend.bm25 = { total: 0, hits: [], facets: {} };
    backend.knn = { total: 2, hits: [hit('a', { title: 'Alpha' }), hit('b', { title: 'Bravo' })] };

    const res = await service.search({ tenant: 'acme', q: 'unrelated words' });

    expect(res.degraded).toBe(false);
    expect(res.results.map((r) => r.id)).toEqual(['a', 'b']);
    expect(res.total).toBe(2);
  });

  it('always applies the mandatory tenant_id filter (defense-in-depth)', async () => {
    const { backend, service } = build();
    backend.bm25 = { total: 1, hits: [hit('a', { title: 'A' })] };
    await service.search({ tenant: 'acme', q: 'hello' });

    const bm25Call = backend.calls.find((c) => 'aggs' in c.body);
    const filter = (bm25Call?.body as any).query.bool.filter;
    expect(filter).toContainEqual({ term: { tenant_id: 'acme' } });

    const knnCall = backend.calls.find((c) => 'knn' in c.body);
    expect((knnCall?.body as any).knn.filter).toContainEqual({ term: { tenant_id: 'acme' } });
  });

  it('degrades to BM25-only when the embedding service is unavailable', async () => {
    const { backend, service } = build({}, null); // embedder returns null
    backend.bm25 = { total: 1, hits: [hit('a', { title: 'A' })] };

    const res = await service.search({ tenant: 'acme', q: 'hello' });

    expect(res.hybridMode).toBe('bm25_only');
    expect(res.degraded).toBe(true);
    expect(res.degradedReasons).toContain('embedding_unavailable');
    expect(res.results.map((r) => r.id)).toEqual(['a']);
    // With no vector, the kNN leg must not be issued.
    expect(backend.calls.some((c) => 'knn' in c.body)).toBe(false);
  });

  it('degrades gracefully when the kNN leg fails', async () => {
    const { backend, service } = build();
    backend.failOn = 'knn';
    backend.bm25 = { total: 1, hits: [hit('a', { title: 'A' })] };

    const res = await service.search({ tenant: 'acme', q: 'hello' });

    expect(res.hybridMode).toBe('bm25_only');
    expect(res.degraded).toBe(true);
    expect(res.degradedReasons).toContain('knn_unavailable');
    expect(res.results.map((r) => r.id)).toEqual(['a']);
  });

  it('returns a degraded empty result when Elasticsearch is fully down', async () => {
    const { backend, service } = build({}, null);
    backend.failOn = 'aggs'; // BM25 leg (the only one in bm25-only) fails

    const res = await service.search({ tenant: 'acme', q: 'hello' });

    expect(res.results).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.degraded).toBe(true);
    expect(res.degradedReasons).toContain('elasticsearch_unavailable');
  });

  it('surfaces did-you-mean on low result counts', async () => {
    const { backend, service } = build();
    backend.bm25 = { total: 0, hits: [], suggest: { dym: [{ text: 'kubernetes', score: 0.8 }] } };
    backend.knn = { total: 0, hits: [] };

    const res = await service.search({ tenant: 'acme', q: 'kubernetis' });

    expect(res.total).toBe(0);
    expect(res.didYouMean).toBe('kubernetes');
  });

  it('caps size at MAX_PAGE_SIZE', async () => {
    const { backend, service } = build({ maxPageSize: 5 });
    backend.bm25 = { total: 0, hits: [] };
    const res = await service.search({ tenant: 'acme', q: 'hello', size: 999 });
    expect(res.size).toBe(5);
  });
});

describe('SearchService.suggest / didYouMean', () => {
  it('returns word suggestions from the autocomplete index', async () => {
    const { backend, service } = build();
    backend.autocomplete = {
      total: 2,
      hits: [
        hit('1', { term: 'india', weight: 3 }),
        hit('2', { term: 'indonesia', weight: 1 }),
        hit('3', { term: 'india', weight: 3 }),
      ],
    };
    const res = await service.suggest({ tenant: 'acme', q: 'ind' });
    expect(res.suggestions).toEqual(['india', 'indonesia']);
    expect(backend.calls[0].index).toBe('auto_complete-acme');
  });

  it('falls back to title suggestions when autocomplete is empty', async () => {
    const { backend, service } = build();
    backend.autocomplete = { total: 0, hits: [] };
    backend.suggest = {
      total: 2,
      hits: [
        hit('1', { title: 'How to reset password' }),
        hit('2', { title: 'Reset password FAQ' }),
        hit('3', { title: 'How to reset password' }),
      ],
    };
    const res = await service.suggest({ tenant: 'acme', q: 'reset' });
    expect(res.suggestions).toEqual(['How to reset password', 'Reset password FAQ']);
  });

  it('falls back to title suggestions when autocomplete index fails', async () => {
    const { backend, service } = build();
    backend.failOn = 'autocomplete';
    backend.suggest = {
      total: 1,
      hits: [hit('1', { title: 'India Handbook' })],
    };
    const res = await service.suggest({ tenant: 'acme', q: 'ind' });
    expect(res.suggestions).toEqual(['India Handbook']);
  });

  it('returns a correction from the phrase suggester', async () => {
    const { backend, service } = build();
    backend.didYouMean = { total: 0, hits: [], suggest: { dym: [{ text: 'elasticsearch', score: 1 }] } };
    const res = await service.didYouMean({ tenant: 'acme', q: 'elasticserch' });
    expect(res.didYouMean).toBe('elasticsearch');
  });
});
