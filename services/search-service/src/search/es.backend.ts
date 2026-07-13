import { Client } from '@elastic/elasticsearch';

import type { AppEnv } from '../config/env';
import type { EsHit, EsSearchResult, FacetBucket, JsonObject, SuggestOption } from '../domain/types';
import type { SearchBackend } from './backend';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class EsSearchBackend implements SearchBackend {
  private readonly client: Client;

  constructor(env: AppEnv) {
    this.client = new Client({
      node: env.elasticsearchUrl,
      auth: env.elasticsearchApiKey ? { apiKey: env.elasticsearchApiKey } : undefined,
      requestTimeout: env.esTimeoutMs,
      maxRetries: 1,
    });
  }

  async search(index: string, body: JsonObject): Promise<EsSearchResult> {
    // The builder emits a flat request body (query/knn/aggs/highlight/suggest/
    // retriever); v8 of the client accepts these spread onto the request.
    const res: any = await this.client.search({ index, ...(body as any) });
    return this.parse(res);
  }

  async ping(): Promise<boolean> {
    try {
      return await this.client.ping();
    } catch {
      return false;
    }
  }

  private parse(res: any): EsSearchResult {
    const rawHits: any[] = res?.hits?.hits ?? [];
    const totalRaw = res?.hits?.total;
    const total = typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? 0);

    const hits: EsHit[] = rawHits.map((h) => ({
      id: String(h._id),
      score: typeof h._score === 'number' ? h._score : 0,
      source: (h._source ?? {}) as JsonObject,
      highlight: h.highlight,
    }));

    const facets: Record<string, FacetBucket[]> = {};
    for (const [key, agg] of Object.entries<any>(res?.aggregations ?? {})) {
      const buckets = agg?.buckets;
      if (Array.isArray(buckets)) {
        facets[key] = buckets.map((b) => ({ value: String(b.key), count: b.doc_count }));
      }
    }

    const suggest: Record<string, SuggestOption[]> = {};
    for (const [key, entries] of Object.entries<any>(res?.suggest ?? {})) {
      const options: SuggestOption[] = [];
      for (const entry of entries ?? []) {
        for (const opt of entry?.options ?? []) {
          options.push({ text: opt.text, score: opt.score ?? 0, freq: opt.freq });
        }
      }
      suggest[key] = options;
    }

    return { total, hits, facets, suggest };
  }
}
