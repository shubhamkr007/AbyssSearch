export const APP_ENV = 'APP_ENV';

export type HybridMode = 'client_rrf' | 'native_rrf';

export interface AppEnv {
  port: number;
  elasticsearchUrl: string;
  elasticsearchApiKey: string;
  embeddingServiceUrl: string;
  redisUrl: string;
  logLevel: string;

  hybridMode: HybridMode;
  rrfRankConstant: number;
  rrfRankWindow: number;
  knnK: number;
  knnNumCandidates: number;

  maxPageSize: number;
  defaultPageSize: number;
  queryCacheTtlSeconds: number;
  vectorCacheSize: number;

  esTimeoutMs: number;
  embeddingTimeoutMs: number;
  didYouMeanThreshold: number;

  searchFields: string[];
  facetFields: string[];
  highlightFields: string[];
  /** tab -> source type; unknown tabs are treated as the source type verbatim; "all" is a wildcard. */
  tabSourceMap: Record<string, string>;

  /** Dev/test: use the in-memory fake backend + embedding client (no Elasticsearch needed). */
  useFake: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  const parts = value.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : fallback;
}

export function loadEnv(): AppEnv {
  const mode = (process.env.HYBRID_MODE ?? 'client_rrf').toLowerCase();
  return {
    port: num(process.env.PORT, 8080),
    elasticsearchUrl: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
    elasticsearchApiKey: process.env.ELASTICSEARCH_API_KEY ?? '',
    embeddingServiceUrl: process.env.EMBEDDING_SERVICE_URL ?? 'http://localhost:8000',
    redisUrl: process.env.REDIS_URL ?? '',
    logLevel: process.env.LOG_LEVEL ?? 'info',

    hybridMode: mode === 'native_rrf' ? 'native_rrf' : 'client_rrf',
    rrfRankConstant: num(process.env.RRF_RANK_CONSTANT, 60),
    rrfRankWindow: num(process.env.RRF_RANK_WINDOW, 100),
    knnK: num(process.env.KNN_K, 50),
    knnNumCandidates: num(process.env.KNN_NUM_CANDIDATES, 200),

    maxPageSize: num(process.env.MAX_PAGE_SIZE, 50),
    defaultPageSize: num(process.env.DEFAULT_PAGE_SIZE, 10),
    queryCacheTtlSeconds: num(process.env.QUERY_CACHE_TTL, 60),
    vectorCacheSize: num(process.env.VECTOR_CACHE_SIZE, 500),

    esTimeoutMs: num(process.env.ES_TIMEOUT_MS, 3000),
    embeddingTimeoutMs: num(process.env.EMBEDDING_TIMEOUT_MS, 1500),
    didYouMeanThreshold: num(process.env.DID_YOU_MEAN_THRESHOLD, 3),

    searchFields: list(process.env.SEARCH_FIELDS, ['title^2', 'body']),
    facetFields: list(process.env.FACET_FIELDS, ['tags', 'source']),
    highlightFields: list(process.env.HIGHLIGHT_FIELDS, ['body']),
    tabSourceMap: {
      documents: 'document',
      news: 'news',
      images: 'image',
    },

    useFake: bool(process.env.USE_FAKE, false),
  };
}
