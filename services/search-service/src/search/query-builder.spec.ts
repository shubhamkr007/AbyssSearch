import {
  type BuilderConfig,
  buildBm25Body,
  buildDidYouMeanBody,
  buildKnnBody,
  buildNativeRrfBody,
  buildSuggestBody,
  filterClauses,
  resolveIndex,
  type SearchParams,
} from './query-builder';

const cfg: BuilderConfig = {
  searchFields: ['title^2', 'body'],
  facetFields: ['tags', 'source'],
  highlightFields: ['body'],
  rrfRankConstant: 60,
  rrfRankWindow: 100,
  knnK: 50,
  knnNumCandidates: 200,
  tabSourceMap: { documents: 'document', news: 'news', images: 'image' },
};

const params = (over: Partial<SearchParams> = {}): SearchParams => ({
  tenant: 'acme',
  tenantId: 'acme',
  q: 'hello world',
  tab: 'all',
  filters: {},
  from: 0,
  size: 10,
  ...over,
});

describe('resolveIndex', () => {
  it('maps the cross-tab "all" view to a wildcard', () => {
    expect(resolveIndex('acme', 'all', cfg.tabSourceMap)).toBe('acme-*');
  });
  it('maps known tabs to their source type alias', () => {
    expect(resolveIndex('acme', 'documents', cfg.tabSourceMap)).toBe('acme-document');
    expect(resolveIndex('acme', 'news', cfg.tabSourceMap)).toBe('acme-news');
  });
  it('treats an unknown tab as the source type verbatim', () => {
    expect(resolveIndex('acme', 'video', cfg.tabSourceMap)).toBe('acme-video');
  });
  it('honors an explicit sources override', () => {
    expect(resolveIndex('acme', 'all', cfg.tabSourceMap, ['document', 'news'])).toBe(
      'acme-document,acme-news',
    );
  });
});

describe('filterClauses', () => {
  it('always injects the mandatory tenant_id filter', () => {
    const clauses = filterClauses('acme', {});
    expect(clauses[0]).toEqual({ term: { tenant_id: 'acme' } });
  });
  it('adds user facet filters and drops empty ones', () => {
    const clauses = filterClauses('acme', { tags: ['billing'], source: [] });
    expect(clauses).toContainEqual({ terms: { tags: ['billing'] } });
    expect(clauses).not.toContainEqual({ terms: { source: [] } });
  });
});

describe('buildBm25Body', () => {
  it('builds a filtered multi_match with facets and highlight', () => {
    const body = buildBm25Body(params(), cfg) as any;
    expect(body.track_total_hits).toBe(true);
    expect(body.query.bool.must[0].multi_match.fields).toEqual(['title^2', 'body']);
    expect(body.query.bool.filter).toContainEqual({ term: { tenant_id: 'acme' } });
    expect(Object.keys(body.aggs)).toEqual(['tags', 'source']);
    expect(body.highlight.fields).toHaveProperty('body');
    expect(body.suggest).toBeUndefined();
  });
  it('embeds the did-you-mean suggester when requested', () => {
    const body = buildBm25Body(params(), cfg, { includeDidYouMean: true }) as any;
    expect(body.suggest.dym.phrase.field).toBe('content_all');
    expect(body.suggest.text).toBe('hello world');
  });
  it('uses match_all for a blank query (browse all docs)', () => {
    const body = buildBm25Body(params({ q: '   ' }), cfg, { includeDidYouMean: true }) as any;
    expect(body.query.bool.must[0]).toEqual({ match_all: {} });
    expect(body.query.bool.filter).toContainEqual({ term: { tenant_id: 'acme' } });
    expect(body.suggest).toBeUndefined();
  });
});

describe('buildKnnBody', () => {
  it('builds a tenant-filtered kNN query', () => {
    const body = buildKnnBody(params(), cfg, [0.1, 0.2, 0.3]) as any;
    expect(body.knn.field).toBe('embedding');
    expect(body.knn.query_vector).toEqual([0.1, 0.2, 0.3]);
    expect(body.knn.k).toBe(50);
    expect(body.knn.num_candidates).toBe(200);
    expect(body.knn.filter).toContainEqual({ term: { tenant_id: 'acme' } });
  });
});

describe('buildNativeRrfBody', () => {
  it('emits a single retriever.rrf request with both legs', () => {
    const body = buildNativeRrfBody(params(), cfg, [0.1]) as any;
    expect(body.retriever.rrf.retrievers).toHaveLength(2);
    expect(body.retriever.rrf.rank_constant).toBe(60);
    expect(body.retriever.rrf.rank_window_size).toBe(100);
  });
});

describe('buildSuggestBody', () => {
  it('builds a tenant-scoped bool_prefix query over title.suggest', () => {
    const body = buildSuggestBody('res', 'acme', {}, 5) as any;
    expect(body.size).toBe(5);
    expect(body.query.bool.must[0].multi_match.type).toBe('bool_prefix');
    expect(body.query.bool.must[0].multi_match.fields).toContain('title.suggest');
    expect(body.query.bool.filter).toContainEqual({ term: { tenant_id: 'acme' } });
  });
});

describe('buildDidYouMeanBody', () => {
  it('returns a size-0 phrase suggester request', () => {
    const body = buildDidYouMeanBody('kubernetis') as any;
    expect(body.size).toBe(0);
    expect(body.suggest.dym.phrase.field).toBe('content_all');
  });
});
