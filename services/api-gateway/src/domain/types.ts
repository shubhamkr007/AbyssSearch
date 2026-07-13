export type JsonObject = Record<string, unknown>;

/** Resolved auth context from S4 `POST /keys/verify`. */
export interface TenantContext {
  tenantId: string;
  prefix: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
}

/** Aggregated bootstrap config from S4 `GET /tenants/:id/config`. */
export interface AggregatedConfig {
  tenant: { id: string; name: string; prefix: string; status: string };
  tabs: unknown[];
  searchConfig: {
    synonyms: unknown[];
    boosts: JsonObject;
    facets: unknown[];
    suggestConfig: JsonObject;
  };
}

// ---- S3 Search Service contract (downstream) ---------------------------

export interface S3SearchRequest {
  tenant: string;
  q: string;
  tab?: string;
  filters?: Record<string, string[]>;
  page?: number;
  size?: number;
  sources?: string[];
}

export interface S3SearchResult {
  id: string;
  score: number;
  title?: string;
  url?: string;
  source?: string;
  snippet?: string;
  tags?: string[];
  highlights?: Record<string, string[]>;
  metadata?: JsonObject;
}

export interface S3SearchResponse {
  query: string;
  tab: string;
  total: number;
  page: number;
  size: number;
  hybridMode: string;
  degraded: boolean;
  degradedReasons?: string[];
  results: S3SearchResult[];
  facets: Record<string, Array<{ value: string; count: number }>>;
  didYouMean: string | null;
  timings: { embedMs: number; esMs: number; totalMs: number };
}

export interface S3SuggestResponse {
  query: string;
  suggestions: string[];
}

// ---- Public widget contract (what the gateway returns) ------------------

export interface WidgetSearchResult {
  id: string;
  title?: string;
  snippet?: string;
  url?: string;
  tags?: string[];
  score: number;
  source?: string;
}

export interface WidgetSearchResponse {
  query: string;
  didYouMean: string | null;
  tab: string;
  total: number;
  page: number;
  size: number;
  took_ms: number;
  degraded: boolean;
  results: WidgetSearchResult[];
  facets: Record<string, Array<{ value: string; count: number }>>;
}
