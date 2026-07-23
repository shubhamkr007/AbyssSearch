import {
  Inject,
  Injectable,
  NotImplementedException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ANALYTICS_CLIENT, type AnalyticsClient } from '../clients/analytics.client';
import { CONFIG_CLIENT, type ConfigClient } from '../clients/config.client';
import { RAG_CLIENT, type RagClient } from '../clients/rag.client';
import { SEARCH_CLIENT, type SearchClient } from '../clients/search.client';
import { APP_ENV, type AppEnv } from '../config/env';
import type {
  AnalyticsEvent,
  JsonObject,
  S3SearchRequest,
  S3SuggestResponse,
  TenantContext,
  WidgetAnswerResponse,
  WidgetSearchResponse,
} from '../domain/types';
import { MetricsService } from '../metrics/metrics.service';
import type { AnswerBodyDto, EventsBodyDto, SearchBodyDto, SuggestQueryDto } from './dto';

/**
 * Flatten the widget filter object into the flat `{ field: string[] }` shape the
 * Search Service expects. Nested objects (e.g. `metadata`) become dotted keys
 * (`metadata.year`) matching the ES `flattened` field mapping.
 */
export function flattenFilters(
  filters: Record<string, unknown> | undefined,
): Record<string, string[]> | undefined {
  if (!filters) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      out[key] = value.map((v) => String(v));
    } else if (value && typeof value === 'object') {
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        out[`${key}.${subKey}`] = [String(subVal)];
      }
    } else if (value !== null && value !== undefined) {
      out[key] = [String(value)];
    }
  }
  return out;
}

@Injectable()
export class GatewayService {
  constructor(
    @Inject(SEARCH_CLIENT) private readonly search: SearchClient,
    @Inject(CONFIG_CLIENT) private readonly config: ConfigClient,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
    @Optional() @Inject(RAG_CLIENT) private readonly rag?: RagClient,
    @Optional() @Inject(ANALYTICS_CLIENT) private readonly analytics?: AnalyticsClient,
  ) {}

  /**
   * Forward events to the Analytics Service without ever blocking or failing the
   * caller. Analytics is best-effort: on any error we bump a metric and move on.
   */
  private recordEvents(
    prefix: string,
    events: AnalyticsEvent[],
    correlationId?: string,
  ): void {
    if (!this.env.analyticsEnabled || !this.analytics || events.length === 0) return;
    void this.analytics.record(prefix, events, correlationId).catch(() => {
      this.metrics?.downstreamErrors.inc({ service: 'analytics' });
    });
  }

  async doSearch(
    ctx: TenantContext,
    dto: SearchBodyDto,
    correlationId?: string,
  ): Promise<WidgetSearchResponse> {
    const started = Date.now();
    const req: S3SearchRequest = {
      tenant: ctx.prefix,
      q: dto.query,
      tab: dto.tab ?? 'all',
      filters: flattenFilters(dto.filters),
      page: dto.page,
      size: dto.size,
    };

    let resp;
    try {
      resp = await this.search.search(req, correlationId);
    } catch {
      this.metrics?.downstreamErrors.inc({ service: 'search' });
      throw new ServiceUnavailableException('search is temporarily unavailable');
    }

    const tookMs = Date.now() - started;
    // Server-side query log: authoritative for top-queries / zero-results /
    // latency (doesn't depend on the widget wiring a beacon). Fire-and-forget.
    this.recordEvents(
      ctx.prefix,
      [
        {
          type: 'query',
          query: dto.query,
          tab: resp.tab,
          resultCount: resp.total,
          latencyMs: tookMs,
          zeroResult: resp.total === 0,
        },
      ],
      correlationId,
    );

    return {
      query: resp.query,
      didYouMean: resp.didYouMean,
      tab: resp.tab,
      total: resp.total,
      page: resp.page,
      size: resp.size,
      took_ms: tookMs,
      degraded: resp.degraded,
      results: resp.results.map((r) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        url: r.url,
        tags: r.tags,
        score: r.score,
        source: r.source,
        entities: r.entities,
        entitiesByType: r.entitiesByType,
      })),
      facets: resp.facets,
    };
  }

  async doAnswer(
    ctx: TenantContext,
    dto: AnswerBodyDto,
    correlationId?: string,
  ): Promise<WidgetAnswerResponse> {
    if (!this.env.ragEnabled || !this.rag) {
      throw new NotImplementedException('RAG answers are not enabled');
    }
    const started = Date.now();
    let resp;
    try {
      resp = await this.rag.answer(
        {
          query: dto.query,
          // ES docs are scoped by the tenant PREFIX (the Search Service filters the
          // same way: it uses `tenant` = prefix as the ES tenant_id filter).
          tenantId: ctx.prefix,
          prefix: ctx.prefix,
          tab: dto.tab,
          filters: dto.filters,
          topK: dto.topK,
        },
        correlationId,
      );
    } catch {
      this.metrics?.downstreamErrors.inc({ service: 'rag' });
      throw new ServiceUnavailableException('answers are temporarily unavailable');
    }

    return {
      query: resp.query,
      answer: resp.answer,
      model: resp.model,
      degraded: resp.degraded,
      took_ms: Date.now() - started,
      citations: resp.citations.map((c) => ({
        n: c.n,
        title: c.title,
        url: c.url,
        source: c.source,
        snippet: c.snippet,
      })),
    };
  }

  async doSuggest(
    ctx: TenantContext,
    dto: SuggestQueryDto,
    correlationId?: string,
  ): Promise<S3SuggestResponse> {
    try {
      return await this.search.suggest(
        { tenant: ctx.prefix, q: dto.q, tab: dto.tab, size: dto.size },
        correlationId,
      );
    } catch {
      // Suggestions are non-critical: degrade to empty instead of failing the widget.
      this.metrics?.downstreamErrors.inc({ service: 'search' });
      return { query: dto.q, suggestions: [] };
    }
  }

  async doAutocomplete(
    ctx: TenantContext,
    dto: SuggestQueryDto,
    correlationId?: string,
  ): Promise<S3SuggestResponse> {
    try {
      return await this.search.autocomplete(
        { tenant: ctx.prefix, q: dto.q, tab: dto.tab, size: dto.size },
        correlationId,
      );
    } catch {
      this.metrics?.downstreamErrors.inc({ service: 'search' });
      return { query: dto.q, suggestions: [] };
    }
  }

  /** Accept client beacons (impressions/clicks) and forward them best-effort. */
  doEvents(
    ctx: TenantContext,
    dto: EventsBodyDto,
    correlationId?: string,
  ): { accepted: number } {
    const ts = new Date().toISOString();
    const events: AnalyticsEvent[] = dto.events.map((e) => ({
      type: e.type,
      query: e.query,
      tab: e.tab,
      docId: e.docId,
      rank: e.rank,
      resultCount: e.resultCount,
      latencyMs: e.latencyMs,
      zeroResult: e.zeroResult,
      sessionId: e.sessionId,
      ts,
    }));
    this.recordEvents(ctx.prefix, events, correlationId);
    return { accepted: events.length };
  }

  async doConfig(ctx: TenantContext, correlationId?: string): Promise<JsonObject> {
    let cfg;
    try {
      cfg = await this.config.getConfig(ctx.tenantId, correlationId);
    } catch {
      this.metrics?.downstreamErrors.inc({ service: 'config' });
      throw new ServiceUnavailableException('configuration is temporarily unavailable');
    }
    return {
      tenantId: ctx.tenantId,
      prefix: ctx.prefix,
      name: cfg.tenant?.name,
      tabs: cfg.tabs,
      facets: cfg.searchConfig?.facets ?? [],
      suggest: cfg.searchConfig?.suggestConfig ?? {},
    };
  }
}
