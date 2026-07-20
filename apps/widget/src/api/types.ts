// Public widget-facing types. These mirror the API Gateway `/v1/*` contract
// (services/api-gateway/src/domain/types.ts) so the widget stays decoupled from
// the Search Service internals.

export interface SearchResultItem {
  id: string;
  title?: string;
  snippet?: string;
  url?: string;
  tags?: string[];
  score: number;
  source?: string;
  /** Flat, de-duplicated entity texts. */
  entities?: string[];
  /** Entities grouped by label, e.g. { ORG: ["Acme"], GPE: ["Berlin"] }. */
  entitiesByType?: Record<string, string[]>;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SearchResponse {
  query: string;
  didYouMean: string | null;
  tab: string;
  total: number;
  page: number;
  size: number;
  took_ms: number;
  degraded: boolean;
  results: SearchResultItem[];
  facets: Record<string, FacetBucket[]>;
}

export interface SuggestResponse {
  query: string;
  suggestions: string[];
}

export interface AnswerCitation {
  n: number;
  title?: string;
  url?: string;
  source?: string;
  snippet?: string;
}

export interface AnswerResponse {
  query: string;
  answer: string;
  model: string;
  degraded: boolean;
  took_ms: number;
  citations: AnswerCitation[];
}

export interface AnswerParams {
  query: string;
  tab?: string;
  filters?: Record<string, string[]>;
  topK?: number;
}

export interface TabConfig {
  key: string;
  label: string;
}

export interface FacetConfig {
  field: string;
  label: string;
}

export interface WidgetConfig {
  name?: string;
  tabs: TabConfig[];
  facets: FacetConfig[];
}

export interface SearchParams {
  query: string;
  tab: string;
  filters: Record<string, string[]>;
  page: number;
  size: number;
}

export interface SuggestParams {
  q: string;
  tab: string;
  size?: number;
}

/** The port the UI depends on; implemented by HTTP (real gateway) and a Fake. */
export interface ApiClient {
  getConfig(signal?: AbortSignal): Promise<WidgetConfig>;
  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse>;
  suggest(params: SuggestParams, signal?: AbortSignal): Promise<SuggestResponse>;
  /** Popular queries for the right-rail. Gateway endpoint is Phase 2, so HTTP returns []. */
  trending(signal?: AbortSignal): Promise<string[]>;
  /** RAG grounded answer (Answers tab). Throws if the gateway has RAG disabled. */
  answer(params: AnswerParams, signal?: AbortSignal): Promise<AnswerResponse>;
}

export const DEFAULT_TABS: TabConfig[] = [
  { key: 'all', label: 'All' },
  { key: 'documents', label: 'Documents' },
  { key: 'news', label: 'News' },
  { key: 'images', label: 'Images' },
];
