import { Inject, Injectable, Optional } from '@nestjs/common';

import { APP_ENV, type AppEnv } from '../config/env';
import type {
  DidYouMeanResponse,
  EsHit,
  EsSearchResult,
  FacetBucket,
  HybridModeUsed,
  JsonObject,
  SearchResponse,
  SearchResultItem,
  SuggestResponse,
} from '../domain/types';
import {
  EMBEDDING_CLIENT,
  type EmbeddingClient,
} from '../embedding/embedding.client';
import { VectorCache } from '../embedding/vector-cache';
import { MetricsService } from '../metrics/metrics.service';
import { SEARCH_BACKEND, type SearchBackend } from './backend';
import type { DidYouMeanDto, SearchDto, SuggestDto } from './dto';
import {
  type BuilderConfig,
  buildAutocompleteBody,
  buildBm25Body,
  buildDidYouMeanBody,
  buildKnnBody,
  buildNativeRrfBody,
  buildSuggestBody,
  resolveAutocompleteIndex,
  resolveIndex,
  type SearchParams,
} from './query-builder';
import { fuseRrf } from './rrf';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const now = (): number => Date.now();

@Injectable()
export class SearchService {
  private readonly cfg: BuilderConfig;
  private readonly vectorCache: VectorCache;

  constructor(
    @Inject(SEARCH_BACKEND) private readonly backend: SearchBackend,
    @Inject(EMBEDDING_CLIENT) private readonly embedding: EmbeddingClient,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {
    this.cfg = {
      searchFields: env.searchFields,
      facetFields: env.facetFields,
      highlightFields: env.highlightFields,
      rrfRankConstant: env.rrfRankConstant,
      rrfRankWindow: env.rrfRankWindow,
      knnK: env.knnK,
      knnNumCandidates: env.knnNumCandidates,
      tabSourceMap: env.tabSourceMap,
    };
    this.vectorCache = new VectorCache(env.vectorCacheSize);
  }

  ping(): Promise<boolean> {
    return this.backend.ping();
  }

  async search(dto: SearchDto): Promise<SearchResponse> {
    const t0 = now();
    const tenant = dto.tenant;
    const tenantId = dto.tenantId ?? dto.tenant;
    const tab = dto.tab ?? 'all';
    const size = clamp(dto.size ?? this.env.defaultPageSize, 1, this.env.maxPageSize);
    const page = Math.max(1, dto.page ?? 1);
    const from = (page - 1) * size;
    const filters = dto.filters ?? {};
    const index = resolveIndex(tenant, tab, this.env.tabSourceMap, dto.sources);
    const params: SearchParams = { tenant, tenantId, q: dto.q, tab, filters, from, size, sources: dto.sources };

    const degradedReasons: string[] = [];
    const q = dto.q.trim();
    const browseAll = q.length === 0;

    // 1) query embedding (cached), degrade to BM25-only on failure.
    // Skip for blank "browse all" queries — there is nothing meaningful to embed.
    let embedMs = 0;
    let vector: number[] | null = null;
    if (!browseAll) {
      const cacheKey = q.toLowerCase();
      const cached = this.vectorCache.get(cacheKey);
      if (cached) {
        vector = cached;
      } else {
        const te = now();
        vector = await this.embedding.embedQuery(q);
        embedMs = now() - te;
        if (vector) this.vectorCache.set(cacheKey, vector);
        else degradedReasons.push('embedding_unavailable');
      }
    }

    // 2) retrieval
    const tes = now();
    let outcome: RetrievalOutcome;
    try {
      if (browseAll) {
        outcome = await this.runBm25Only(index, { ...params, q: '' });
      } else if (vector && this.env.hybridMode === 'native_rrf') {
        outcome = await this.runNativeRrf(index, params, vector).catch(() =>
          this.runClientRrf(index, params, vector),
        );
      } else if (vector) {
        outcome = await this.runClientRrf(index, params, vector);
      } else {
        outcome = await this.runBm25Only(index, params);
      }
    } catch {
      // Total ES failure: return a degraded, empty result rather than erroring.
      degradedReasons.push('elasticsearch_unavailable');
      outcome = { hybridMode: 'bm25_only', hits: [], total: 0, facets: {}, didYouMean: null };
    }
    const esMs = now() - tes;
    outcome.degradedReasons?.forEach((r) => degradedReasons.push(r));

    const totalMs = now() - t0;
    const degraded = degradedReasons.length > 0;

    this.metrics?.searchRequests.inc({ mode: outcome.hybridMode, degraded: String(degraded) });
    if (outcome.total === 0) this.metrics?.zeroResults.inc();
    if (embedMs) this.metrics?.duration.observe({ phase: 'embed' }, embedMs / 1000);
    this.metrics?.duration.observe({ phase: 'es' }, esMs / 1000);
    this.metrics?.duration.observe({ phase: 'total' }, totalMs / 1000);

    return {
      query: dto.q,
      tab,
      total: outcome.total,
      page,
      size,
      hybridMode: outcome.hybridMode,
      degraded,
      degradedReasons: degraded ? degradedReasons : undefined,
      results: outcome.hits,
      facets: outcome.facets,
      didYouMean: outcome.didYouMean,
      timings: { embedMs, esMs, totalMs },
    };
  }

  async suggest(dto: SuggestDto): Promise<SuggestResponse> {
    this.metrics?.suggestRequests.inc({ kind: 'suggest' });
    return this.suggestWords(dto);
  }

  async autocomplete(dto: SuggestDto): Promise<SuggestResponse> {
    this.metrics?.suggestRequests.inc({ kind: 'autocomplete' });
    return this.suggestWords(dto);
  }

  async didYouMean(dto: DidYouMeanDto): Promise<DidYouMeanResponse> {
    this.metrics?.suggestRequests.inc({ kind: 'did_you_mean' });
    const index = resolveIndex(dto.tenant, dto.tab ?? 'all', this.env.tabSourceMap);
    try {
      const res = await this.backend.search(index, buildDidYouMeanBody(dto.q));
      return { query: dto.q, didYouMean: this.pickDidYouMean(res, dto.q) };
    } catch {
      return { query: dto.q, didYouMean: null };
    }
  }

  // ---- retrieval strategies ---------------------------------------------

  private async runClientRrf(
    index: string,
    params: SearchParams,
    vector: number[],
  ): Promise<RetrievalOutcome> {
    const reasons: string[] = [];
    // BM25 leg fetches the fusion window (+ facets, highlight, did-you-mean).
    const bm25Body = buildBm25Body(
      { ...params, from: 0, size: this.env.rrfRankWindow },
      this.cfg,
      { includeDidYouMean: true },
    );
    const knnBody = buildKnnBody(params, this.cfg, vector);

    const [bm25Settled, knnSettled] = await Promise.allSettled([
      this.backend.search(index, bm25Body),
      this.backend.search(index, knnBody),
    ]);
    const bm25 = value(bm25Settled);
    const knn = value(knnSettled);

    if (!bm25 && !knn) throw new Error('both retrieval legs failed');
    if (!bm25) reasons.push('bm25_unavailable');
    if (!knn) reasons.push('knn_unavailable');

    const legs: EsHit[][] = [];
    if (bm25) legs.push(bm25.hits);
    if (knn) legs.push(knn.hits);
    const fused = fuseRrf(legs, this.env.rrfRankConstant, this.env.rrfRankWindow);

    const byId = new Map<string, EsHit>();
    for (const h of knn?.hits ?? []) byId.set(h.id, h);
    for (const h of bm25?.hits ?? []) byId.set(h.id, h); // prefer BM25 (has highlight)

    const pageSlice = fused.slice(params.from, params.from + params.size);
    const hits = pageSlice
      .map((f) => {
        const hit = byId.get(f.id);
        return hit ? this.toItem(hit, f.score) : null;
      })
      .filter((x): x is SearchResultItem => x !== null);

    const hybridMode: HybridModeUsed = bm25 && knn ? 'client_rrf' : bm25 ? 'bm25_only' : 'client_rrf';
    // Hybrid total = union of both legs. Using the fused (deduped) size as a floor
    // so a pure-semantic match (BM25 total 0, kNN hits > 0) isn't reported as 0.
    const total = Math.max(bm25?.total ?? 0, fused.length);
    const didYouMean =
      total < this.env.didYouMeanThreshold && bm25 ? this.pickDidYouMean(bm25, params.q) : null;

    return { hybridMode, hits, total, facets: bm25?.facets ?? {}, didYouMean, degradedReasons: reasons };
  }

  private async runBm25Only(index: string, params: SearchParams): Promise<RetrievalOutcome> {
    const body = buildBm25Body(params, this.cfg, { includeDidYouMean: true });
    const res = await this.backend.search(index, body);
    const hits = res.hits.map((h) => this.toItem(h, h.score));
    const didYouMean =
      res.total < this.env.didYouMeanThreshold ? this.pickDidYouMean(res, params.q) : null;
    return { hybridMode: 'bm25_only', hits, total: res.total, facets: res.facets ?? {}, didYouMean };
  }

  private async runNativeRrf(
    index: string,
    params: SearchParams,
    vector: number[],
  ): Promise<RetrievalOutcome> {
    const res = await this.backend.search(index, buildNativeRrfBody(params, this.cfg, vector));
    const hits = res.hits.map((h) => this.toItem(h, h.score));
    const didYouMean =
      res.total < this.env.didYouMeanThreshold
        ? await this.didYouMean({ tenant: params.tenant, tenantId: params.tenantId, q: params.q, tab: params.tab }).then((r) => r.didYouMean)
        : null;
    return { hybridMode: 'native_rrf', hits, total: res.total, facets: res.facets ?? {}, didYouMean };
  }

  // ---- helpers -----------------------------------------------------------

  /**
   * Word-by-word suggestions from `auto_complete-{prefix}`. Falls back to
   * title-based `search_as_you_type` when the autocomplete index is empty or
   * unavailable (e.g. tenant not yet backfilled).
   */
  private async suggestWords(dto: SuggestDto): Promise<SuggestResponse> {
    const tenantId = dto.tenantId ?? dto.tenant;
    const size = clamp(dto.size ?? 8, 1, 25);
    const q = (dto.q ?? '').trim();
    if (!q) {
      return { query: dto.q, suggestions: [] };
    }

    try {
      const index = resolveAutocompleteIndex(dto.tenant);
      const res = await this.backend.search(index, buildAutocompleteBody(q, tenantId, size));
      const seen = new Set<string>();
      const suggestions: string[] = [];
      for (const hit of res.hits) {
        const term = (hit.source as { term?: unknown }).term;
        if (typeof term === 'string' && term && !seen.has(term)) {
          seen.add(term);
          suggestions.push(term);
        }
      }
      if (suggestions.length > 0) {
        return { query: dto.q, suggestions };
      }
    } catch {
      // fall through to title suggest
    }
    return this.suggestTitles(dto);
  }

  private async suggestTitles(dto: SuggestDto): Promise<SuggestResponse> {
    const tenantId = dto.tenantId ?? dto.tenant;
    const index = resolveIndex(dto.tenant, dto.tab ?? 'all', this.env.tabSourceMap);
    const size = clamp(dto.size ?? 8, 1, 25);
    try {
      const res = await this.backend.search(index, buildSuggestBody(dto.q, tenantId, {}, size));
      const seen = new Set<string>();
      const suggestions: string[] = [];
      for (const hit of res.hits) {
        const title = (hit.source as { title?: unknown }).title;
        if (typeof title === 'string' && !seen.has(title)) {
          seen.add(title);
          suggestions.push(title);
        }
      }
      return { query: dto.q, suggestions };
    } catch {
      return { query: dto.q, suggestions: [] };
    }
  }

  private pickDidYouMean(res: EsSearchResult, q: string): string | null {
    const option = res.suggest?.dym?.[0]?.text;
    if (option && option.trim().toLowerCase() !== q.trim().toLowerCase()) {
      return option;
    }
    return null;
  }

  private toItem(hit: EsHit, score: number): SearchResultItem {
    const s = hit.source as Record<string, unknown>;
    const highlights = hit.highlight;
    const bodyHighlight = highlights?.body?.[0];
    const body = typeof s.body === 'string' ? s.body : undefined;
    const snippet = bodyHighlight ?? (body ? body.slice(0, 200) : undefined);
    return {
      id: hit.id,
      score,
      title: typeof s.title === 'string' ? s.title : undefined,
      url: typeof s.url === 'string' ? s.url : undefined,
      source: typeof s.source === 'string' ? s.source : undefined,
      tags: Array.isArray(s.tags) ? (s.tags as string[]) : undefined,
      snippet,
      highlights,
      metadata: (s.metadata as JsonObject | undefined) ?? undefined,
      entities: Array.isArray(s.entities) ? (s.entities as string[]) : undefined,
      entitiesByType: toEntitiesByType(s.entities_by_type),
    };
  }
}

/** Coerce the ES `entities_by_type` (flattened) source into a clean {label: string[]} map. */
function toEntitiesByType(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [label, raw] of Object.entries(value as Record<string, unknown>)) {
    const arr = Array.isArray(raw) ? raw : [raw];
    const clean = arr
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v))
      .filter((v) => v.length > 0);
    if (clean.length > 0) out[label] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface RetrievalOutcome {
  hybridMode: HybridModeUsed;
  hits: SearchResultItem[];
  total: number;
  facets: Record<string, FacetBucket[]>;
  didYouMean: string | null;
  degradedReasons?: string[];
}

function value<T>(settled: PromiseSettledResult<T>): T | null {
  return settled.status === 'fulfilled' ? settled.value : null;
}
