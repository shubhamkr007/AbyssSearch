import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';

import { CONFIG_CLIENT, type ConfigClient } from '../clients/config.client';
import { SEARCH_CLIENT, type SearchClient } from '../clients/search.client';
import { APP_ENV, type AppEnv } from '../config/env';
import type {
  JsonObject,
  S3SearchRequest,
  S3SuggestResponse,
  TenantContext,
  WidgetSearchResponse,
} from '../domain/types';
import { MetricsService } from '../metrics/metrics.service';
import type { SearchBodyDto, SuggestQueryDto } from './dto';

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
  ) {}

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

    return {
      query: resp.query,
      didYouMean: resp.didYouMean,
      tab: resp.tab,
      total: resp.total,
      page: resp.page,
      size: resp.size,
      took_ms: Date.now() - started,
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
