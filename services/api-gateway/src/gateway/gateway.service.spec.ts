import { ServiceUnavailableException } from '@nestjs/common';

import { FakeAnalyticsClient } from '../clients/analytics.client';
import { FakeConfigClient } from '../clients/config.client';
import { FakeSearchClient } from '../clients/search.client';
import { type AppEnv, loadEnv } from '../config/env';
import type { TenantContext } from '../domain/types';
import { flattenFilters, GatewayService } from './gateway.service';

const CTX: TenantContext = {
  tenantId: 't1',
  prefix: 'acme',
  scopes: ['search'],
  originAllowlist: [],
  rateLimit: 60,
};

function build(envOverrides?: Partial<AppEnv>) {
  const search = new FakeSearchClient();
  const config = new FakeConfigClient();
  const analytics = new FakeAnalyticsClient();
  const env = { ...loadEnv(), ...envOverrides };
  const service = new GatewayService(search, config, env, undefined, undefined, analytics);
  return { search, config, analytics, service };
}

describe('flattenFilters', () => {
  it('normalizes arrays, scalars, and nested metadata', () => {
    expect(
      flattenFilters({ tags: ['a', 'b'], source: 'news', metadata: { year: 2026 } }),
    ).toEqual({ tags: ['a', 'b'], source: ['news'], 'metadata.year': ['2026'] });
  });

  it('returns undefined when no filters given', () => {
    expect(flattenFilters(undefined)).toBeUndefined();
  });
});

describe('GatewayService.doSearch', () => {
  it('maps the widget request to S3 and shapes the response', async () => {
    const { search, service } = build();
    search.searchResponse = {
      query: '',
      tab: 'documents',
      total: 5,
      page: 1,
      size: 10,
      hybridMode: 'client_rrf',
      degraded: false,
      results: [
        { id: 'd1', score: 0.9, title: 'Doc', snippet: 's', url: 'u', tags: ['x'], source: 'document', metadata: { a: 1 } },
      ],
      facets: { tags: [{ value: 'x', count: 5 }] },
      didYouMean: null,
      timings: { embedMs: 1, esMs: 2, totalMs: 3 },
    };

    const res = await service.doSearch(CTX, { query: 'hello', tab: 'documents', filters: { tags: ['x'] } });

    // Tenant prefix is injected downstream (never the raw tenantId).
    const sent = search.calls[0].payload as { tenant: string; filters: unknown };
    expect(sent.tenant).toBe('acme');
    expect(sent.filters).toEqual({ tags: ['x'] });

    expect(res.total).toBe(5);
    expect(res.results[0]).toEqual({
      id: 'd1',
      title: 'Doc',
      snippet: 's',
      url: 'u',
      tags: ['x'],
      score: 0.9,
      source: 'document',
    });
    // Internal fields (metadata/highlights) are not leaked to the widget.
    expect((res.results[0] as unknown as Record<string, unknown>).metadata).toBeUndefined();
    expect(typeof res.took_ms).toBe('number');
  });

  it('maps a search outage to 503', async () => {
    const { search, service } = build();
    search.fail = true;
    await expect(service.doSearch(CTX, { query: 'x' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('logs a server-side query event when analytics is enabled', async () => {
    const { search, analytics, service } = build({ analyticsEnabled: true });
    search.searchResponse = {
      query: '',
      tab: 'all',
      total: 0,
      page: 1,
      size: 10,
      hybridMode: 'client_rrf',
      degraded: false,
      results: [],
      facets: {},
      didYouMean: null,
      timings: { embedMs: 0, esMs: 0, totalMs: 0 },
    };
    await service.doSearch(CTX, { query: 'nothing here' });
    expect(analytics.calls).toHaveLength(1);
    expect(analytics.calls[0].prefix).toBe('acme');
    const ev = analytics.calls[0].events[0];
    expect(ev).toMatchObject({ type: 'query', query: 'nothing here', zeroResult: true, resultCount: 0 });
  });

  it('does not log query events when analytics is disabled', async () => {
    const { analytics, service } = build({ analyticsEnabled: false });
    await service.doSearch(CTX, { query: 'x' });
    expect(analytics.calls).toHaveLength(0);
  });

  it('never fails search when the analytics write throws', async () => {
    const { analytics, service } = build({ analyticsEnabled: true });
    analytics.fail = true;
    await expect(service.doSearch(CTX, { query: 'ok' })).resolves.toBeDefined();
  });
});

describe('GatewayService.doEvents', () => {
  it('forwards client beacons to analytics with the tenant prefix', () => {
    const { analytics, service } = build({ analyticsEnabled: true });
    const res = service.doEvents(CTX, {
      events: [{ type: 'click', query: 'security', tab: 'all', docId: 'd1', rank: 0 }],
    });
    expect(res).toEqual({ accepted: 1 });
    expect(analytics.calls[0].prefix).toBe('acme');
    expect(analytics.calls[0].events[0]).toMatchObject({ type: 'click', docId: 'd1' });
    expect(analytics.calls[0].events[0].ts).toBeDefined();
  });

  it('is a no-op when analytics is disabled', () => {
    const { analytics, service } = build({ analyticsEnabled: false });
    const res = service.doEvents(CTX, { events: [{ type: 'impression', query: 'x' }] });
    expect(res).toEqual({ accepted: 1 });
    expect(analytics.calls).toHaveLength(0);
  });
});

describe('GatewayService.doSuggest', () => {
  it('degrades to empty suggestions when search is down', async () => {
    const { search, service } = build();
    search.fail = true;
    const res = await service.doSuggest(CTX, { q: 're' });
    expect(res).toEqual({ query: 're', suggestions: [] });
  });
});

describe('GatewayService.doConfig', () => {
  it('returns shaped bootstrap config', async () => {
    const { config, service } = build();
    config.configs.set('t1', {
      tenant: { id: 't1', name: 'Acme', prefix: 'acme', status: 'active' },
      tabs: [{ tabKey: 'all' }],
      searchConfig: { synonyms: [], boosts: {}, facets: ['tags'], suggestConfig: {} },
    });
    const res = await service.doConfig(CTX);
    expect(res.prefix).toBe('acme');
    expect(res.name).toBe('Acme');
    expect(res.facets).toEqual(['tags']);
  });

  it('maps a config outage to 503', async () => {
    const { config, service } = build();
    config.unavailable = true;
    await expect(service.doConfig(CTX)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
