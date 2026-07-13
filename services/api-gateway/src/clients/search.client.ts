import type { S3SearchRequest, S3SearchResponse, S3SuggestResponse } from '../domain/types';
import { httpJson } from './http';

export const SEARCH_CLIENT = 'SEARCH_CLIENT';

export class SearchUnavailableError extends Error {
  constructor(message = 'search service unavailable') {
    super(message);
    this.name = 'SearchUnavailableError';
  }
}

export interface SuggestParams {
  tenant: string;
  q: string;
  tab?: string;
  size?: number;
}

export interface SearchClient {
  search(req: S3SearchRequest, correlationId?: string): Promise<S3SearchResponse>;
  suggest(params: SuggestParams, correlationId?: string): Promise<S3SuggestResponse>;
  autocomplete(params: SuggestParams, correlationId?: string): Promise<S3SuggestResponse>;
}

export class HttpSearchClient implements SearchClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async search(req: S3SearchRequest, correlationId?: string): Promise<S3SearchResponse> {
    try {
      const res = await httpJson(this.url('/search'), {
        method: 'POST',
        body: req,
        timeoutMs: this.timeoutMs,
        correlationId,
      });
      if (res.status !== 200) throw new SearchUnavailableError(`search returned ${res.status}`);
      return (await res.json()) as S3SearchResponse;
    } catch (err) {
      if (err instanceof SearchUnavailableError) throw err;
      throw new SearchUnavailableError((err as Error).message);
    }
  }

  private async suggestPath(
    path: '/suggest' | '/autocomplete',
    params: SuggestParams,
    correlationId?: string,
  ): Promise<S3SuggestResponse> {
    const qs = new URLSearchParams({ tenant: params.tenant, q: params.q });
    if (params.tab) qs.set('tab', params.tab);
    if (params.size) qs.set('size', String(params.size));
    try {
      const res = await httpJson(this.url(`${path}?${qs.toString()}`), {
        timeoutMs: this.timeoutMs,
        correlationId,
      });
      if (res.status !== 200) throw new SearchUnavailableError(`${path} returned ${res.status}`);
      return (await res.json()) as S3SuggestResponse;
    } catch (err) {
      if (err instanceof SearchUnavailableError) throw err;
      throw new SearchUnavailableError((err as Error).message);
    }
  }

  suggest(params: SuggestParams, correlationId?: string): Promise<S3SuggestResponse> {
    return this.suggestPath('/suggest', params, correlationId);
  }

  autocomplete(params: SuggestParams, correlationId?: string): Promise<S3SuggestResponse> {
    return this.suggestPath('/autocomplete', params, correlationId);
  }
}

/** In-memory client for tests / USE_FAKE dev mode. */
export class FakeSearchClient implements SearchClient {
  searchResponse: S3SearchResponse | null = null;
  suggestResponse: S3SuggestResponse = { query: '', suggestions: [] };
  fail = false;
  readonly calls: Array<{ kind: string; payload: unknown }> = [];

  async search(req: S3SearchRequest): Promise<S3SearchResponse> {
    this.calls.push({ kind: 'search', payload: req });
    if (this.fail) throw new SearchUnavailableError();
    if (this.searchResponse) {
      return {
        ...this.searchResponse,
        query: req.q,
        tab: req.tab ?? this.searchResponse.tab,
        page: req.page ?? this.searchResponse.page,
        size: req.size ?? this.searchResponse.size,
      };
    }
    return {
      query: req.q,
      tab: req.tab ?? 'all',
      total: 0,
      page: req.page ?? 1,
      size: req.size ?? 10,
      hybridMode: 'client_rrf',
      degraded: false,
      results: [],
      facets: {},
      didYouMean: null,
      timings: { embedMs: 0, esMs: 0, totalMs: 0 },
    };
  }

  async suggest(params: SuggestParams): Promise<S3SuggestResponse> {
    this.calls.push({ kind: 'suggest', payload: params });
    if (this.fail) throw new SearchUnavailableError();
    return { ...this.suggestResponse, query: params.q };
  }

  autocomplete(params: SuggestParams): Promise<S3SuggestResponse> {
    this.calls.push({ kind: 'autocomplete', payload: params });
    if (this.fail) throw new SearchUnavailableError();
    return Promise.resolve({ ...this.suggestResponse, query: params.q });
  }
}
