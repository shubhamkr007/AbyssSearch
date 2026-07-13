import type { JsonObject } from '../domain/types';

export interface BuilderConfig {
  searchFields: string[];
  facetFields: string[];
  highlightFields: string[];
  rrfRankConstant: number;
  rrfRankWindow: number;
  knnK: number;
  knnNumCandidates: number;
  tabSourceMap: Record<string, string>;
}

export interface SearchParams {
  /** Tenant prefix - used both for index/alias resolution and the tenant_id filter. */
  tenant: string;
  /** Value for the mandatory tenant_id term filter (defaults to `tenant`). */
  tenantId: string;
  q: string;
  tab: string;
  filters: Record<string, string[]>;
  from: number;
  size: number;
  /** Optional explicit source types (overrides tab-based resolution). */
  sources?: string[];
}

type Clause = JsonObject;

/**
 * Resolve the read alias(es) from tenant prefix + tab. Physical indices are
 * `{prefix}-{sourceType}-v{N}` behind read alias `{prefix}-{sourceType}`; the
 * cross-tab "all" view is the `{prefix}-*` wildcard.
 */
export function resolveIndex(
  tenant: string,
  tab: string,
  tabSourceMap: Record<string, string>,
  sources?: string[],
): string {
  if (sources && sources.length > 0) {
    return sources.map((s) => `${tenant}-${s}`).join(',');
  }
  if (!tab || tab === 'all') {
    return `${tenant}-*`;
  }
  const sourceType = tabSourceMap[tab] ?? tab;
  return `${tenant}-${sourceType}`;
}

/** Mandatory tenant_id filter (defense-in-depth) plus any user-supplied facet filters. */
export function filterClauses(
  tenantId: string,
  filters: Record<string, string[]>,
): Clause[] {
  const clauses: Clause[] = [{ term: { tenant_id: tenantId } }];
  for (const [field, values] of Object.entries(filters ?? {})) {
    const clean = (values ?? []).filter((v) => v !== undefined && v !== null && v !== '');
    if (clean.length > 0) {
      clauses.push({ terms: { [field]: clean } });
    }
  }
  return clauses;
}

function multiMatch(q: string, fields: string[]): Clause {
  return { multi_match: { query: q, fields, type: 'best_fields', operator: 'or' } };
}

function facetAggs(fields: string[]): JsonObject {
  const aggs: JsonObject = {};
  for (const field of fields) {
    aggs[field] = { terms: { field, size: 20 } };
  }
  return aggs;
}

function highlight(fields: string[]): JsonObject {
  const h: JsonObject = {};
  for (const field of fields) h[field] = {};
  return { fields: h };
}

/** Phrase/term "did you mean" suggester block, embedded in the BM25 request. */
export function didYouMeanSuggest(q: string): JsonObject {
  return {
    text: q,
    dym: {
      phrase: {
        field: 'content_all',
        size: 1,
        gram_size: 3,
        max_errors: 2,
        direct_generator: [{ field: 'content_all', suggest_mode: 'popular' }],
      },
    },
  };
}

export function buildBm25Body(
  params: SearchParams,
  cfg: BuilderConfig,
  opts: { includeDidYouMean?: boolean } = {},
): JsonObject {
  const body: JsonObject = {
    from: params.from,
    size: params.size,
    track_total_hits: true,
    query: {
      bool: {
        must: [multiMatch(params.q, cfg.searchFields)],
        filter: filterClauses(params.tenantId, params.filters),
      },
    },
    aggs: facetAggs(cfg.facetFields),
    highlight: highlight(cfg.highlightFields),
  };
  if (opts.includeDidYouMean) {
    body.suggest = didYouMeanSuggest(params.q);
  }
  return body;
}

export function buildKnnBody(
  params: SearchParams,
  cfg: BuilderConfig,
  vector: number[],
): JsonObject {
  return {
    size: cfg.knnK,
    knn: {
      field: 'embedding',
      query_vector: vector,
      k: cfg.knnK,
      num_candidates: cfg.knnNumCandidates,
      filter: filterClauses(params.tenantId, params.filters),
    },
  };
}

/** Single-request native RRF (Elasticsearch Enterprise-only retriever). */
export function buildNativeRrfBody(
  params: SearchParams,
  cfg: BuilderConfig,
  vector: number[],
): JsonObject {
  const filter = filterClauses(params.tenantId, params.filters);
  return {
    from: params.from,
    size: params.size,
    retriever: {
      rrf: {
        retrievers: [
          { standard: { query: { bool: { must: [multiMatch(params.q, cfg.searchFields)], filter } } } },
          {
            knn: {
              field: 'embedding',
              query_vector: vector,
              k: cfg.knnK,
              num_candidates: cfg.knnNumCandidates,
              filter,
            },
          },
        ],
        rank_constant: cfg.rrfRankConstant,
        rank_window_size: cfg.rrfRankWindow,
      },
    },
    aggs: facetAggs(cfg.facetFields),
    highlight: highlight(cfg.highlightFields),
  };
}

/** search_as_you_type prefix query over `title.suggest`, tenant-scoped. */
export function buildSuggestBody(
  q: string,
  tenantId: string,
  filters: Record<string, string[]>,
  size: number,
): JsonObject {
  return {
    size,
    _source: ['title', 'url'],
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query: q,
              type: 'bool_prefix',
              fields: ['title.suggest', 'title.suggest._2gram', 'title.suggest._3gram'],
            },
          },
        ],
        filter: filterClauses(tenantId, filters),
      },
    },
  };
}

/** Standalone did-you-mean request (size 0; only the suggester runs). */
export function buildDidYouMeanBody(q: string): JsonObject {
  return {
    size: 0,
    suggest: didYouMeanSuggest(q),
  };
}
