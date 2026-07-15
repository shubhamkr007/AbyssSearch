// Stable, framework-agnostic contracts for the search plane. The Elasticsearch
// backend maps raw ES responses into these shapes; the service never leaks raw
// ES DSL or responses to callers.

export type JsonObject = Record<string, unknown>;

/** A single normalized hit as returned by a SearchBackend. */
export interface EsHit {
  id: string;
  score: number;
  source: JsonObject;
  highlight?: Record<string, string[]>;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SuggestOption {
  text: string;
  score: number;
  freq?: number;
}

/** Normalized result of executing one query body against the backend. */
export interface EsSearchResult {
  total: number;
  hits: EsHit[];
  facets?: Record<string, FacetBucket[]>;
  suggest?: Record<string, SuggestOption[]>;
}

// ---- public API contract ------------------------------------------------

export type HybridModeUsed = 'client_rrf' | 'native_rrf' | 'bm25_only';

export interface SearchResultItem {
  id: string;
  score: number;
  title?: string;
  url?: string;
  source?: string;
  snippet?: string;
  tags?: string[];
  highlights?: Record<string, string[]>;
  metadata?: JsonObject;
  /** Flat, de-duplicated entity texts (from the NER analyze job). */
  entities?: string[];
  /** Entities grouped by label, e.g. { ORG: ["ACME Corp"], GPE: ["Berlin"] }. */
  entitiesByType?: Record<string, string[]>;
}

export interface SearchResponse {
  query: string;
  tab: string;
  total: number;
  page: number;
  size: number;
  hybridMode: HybridModeUsed;
  degraded: boolean;
  degradedReasons?: string[];
  results: SearchResultItem[];
  facets: Record<string, FacetBucket[]>;
  didYouMean: string | null;
  timings: { embedMs: number; esMs: number; totalMs: number };
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

export interface DidYouMeanResponse {
  query: string;
  didYouMean: string | null;
}
