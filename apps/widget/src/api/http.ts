import {
  AnalyticsEventInput,
  AnswerParams,
  AnswerResponse,
  ApiClient,
  DEFAULT_TABS,
  FacetConfig,
  SearchParams,
  SearchResponse,
  SuggestParams,
  SuggestResponse,
  TabConfig,
  WidgetConfig,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RawConfig {
  name?: string;
  tabs?: Array<{ tabKey?: string; key?: string; label?: string; enabled?: boolean; position?: number }>;
  facets?: Array<string | { field?: string; label?: string }>;
}

/** Map the gateway `/v1/config` payload into the widget's normalized shape. */
export function normalizeConfig(raw: RawConfig | null | undefined): WidgetConfig {
  const rawTabs = Array.isArray(raw?.tabs) ? raw!.tabs! : [];
  const tabs: TabConfig[] = rawTabs
    .filter((t) => t.enabled !== false)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((t) => ({ key: String(t.tabKey ?? t.key ?? ''), label: String(t.label ?? t.tabKey ?? t.key ?? '') }))
    .filter((t) => t.key.length > 0);

  const rawFacets = Array.isArray(raw?.facets) ? raw!.facets! : [];
  const facets: FacetConfig[] = rawFacets
    .map((f) =>
      typeof f === 'string'
        ? { field: f, label: humanize(f) }
        : { field: String(f.field ?? ''), label: String(f.label ?? humanize(String(f.field ?? ''))) },
    )
    .filter((f) => f.field.length > 0);

  return {
    name: raw?.name,
    tabs: tabs.length > 0 ? tabs : DEFAULT_TABS,
    facets,
  };
}

function humanize(field: string): string {
  const base = field.split('.').pop() ?? field;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Talks to the API Gateway over HTTPS. Only the public search key is used. */
export class HttpApiClient implements ApiClient {
  private readonly base: string;

  constructor(
    apiBase: string,
    private readonly tenantKey: string,
  ) {
    this.base = apiBase.replace(/\/+$/, '');
  }

  private headers(): HeadersInit {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.tenantKey}`,
    };
  }

  async getConfig(signal?: AbortSignal): Promise<WidgetConfig> {
    const raw = await this.request<RawConfig>('GET', '/v1/config', undefined, signal);
    return normalizeConfig(raw);
  }

  search(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
    return this.request<SearchResponse>(
      'POST',
      '/v1/search',
      {
        query: params.query,
        tab: params.tab,
        filters: params.filters,
        page: params.page,
        size: params.size,
      },
      signal,
    );
  }

  suggest(params: SuggestParams, signal?: AbortSignal): Promise<SuggestResponse> {
    const qs = new URLSearchParams({ q: params.q });
    if (params.tab) qs.set('tab', params.tab);
    if (params.size) qs.set('size', String(params.size));
    return this.request<SuggestResponse>('GET', `/v1/suggest?${qs.toString()}`, undefined, signal);
  }

  answer(params: AnswerParams, signal?: AbortSignal): Promise<AnswerResponse> {
    return this.request<AnswerResponse>(
      'POST',
      '/v1/answers',
      {
        query: params.query,
        tab: params.tab,
        filters: params.filters,
        topK: params.topK,
      },
      signal,
    );
  }

  // No gateway trending endpoint yet (Phase 2 analytics). The widget falls back
  // to the `trending` attribute and local recent searches.
  async trending(): Promise<string[]> {
    return [];
  }

  /**
   * Best-effort analytics beacon. Uses `keepalive` so in-flight events survive a
   * navigation, and never throws — analytics must not affect the search UX.
   */
  sendEvents(events: AnalyticsEventInput[]): void {
    if (!events.length) return;
    try {
      void fetch(`${this.base}/v1/events`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ events }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore: fire-and-forget */
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError('network error');
    }
    if (!res.ok) {
      throw new ApiError(`request failed (${res.status})`, res.status);
    }
    return (await res.json()) as T;
  }
}
