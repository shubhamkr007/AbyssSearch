import { describe, expect, it } from 'vitest';

import { FakeApiClient } from '../src/api/fake';

const client = new FakeApiClient(0);

describe('FakeApiClient', () => {
  it('returns default tabs and facets from config', async () => {
    const cfg = await client.getConfig();
    expect(cfg.tabs.map((t) => t.key)).toEqual(['all', 'documents', 'news', 'images']);
    expect(cfg.facets.map((f) => f.field)).toContain('tags');
  });

  it('scopes results to a tab source', async () => {
    const res = await client.search({ query: 'acme', tab: 'news', filters: {}, page: 1, size: 10 });
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results.every((r) => r.source === 'news')).toBe(true);
  });

  it('applies tag facet filters', async () => {
    const all = await client.search({ query: 'policy', tab: 'all', filters: {}, page: 1, size: 10 });
    const filtered = await client.search({
      query: 'policy',
      tab: 'all',
      filters: { tags: ['security'] },
      page: 1,
      size: 10,
    });
    expect(all.total).toBeGreaterThan(filtered.total);
    expect(filtered.results.every((r) => r.tags?.includes('security'))).toBe(true);
  });

  it('suggests completions for a prefix', async () => {
    const res = await client.suggest({ q: 'kuber', tab: 'all' });
    expect(res.suggestions.some((s) => /kubernetes/i.test(s))).toBe(true);
  });

  it('offers a did-you-mean when nothing matches', async () => {
    const res = await client.search({ query: 'kubernets', tab: 'all', filters: {}, page: 1, size: 10 });
    expect(res.total).toBe(0);
    expect(res.didYouMean).toBe('kubernetes');
  });

  it('paginates results', async () => {
    const page1 = await client.search({ query: 'acme', tab: 'all', filters: {}, page: 1, size: 2 });
    expect(page1.size).toBe(2);
    expect(page1.results.length).toBeLessThanOrEqual(2);
    expect(page1.total).toBeGreaterThan(2);
  });
});
