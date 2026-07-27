import { Logger } from '@nestjs/common';

export const RERANKER_CLIENT = 'RERANKER_CLIENT';

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  score: number;
}

export interface RerankResponse {
  results: RerankResult[];
  skipped: boolean;
  reason?: string | null;
}

/**
 * Optional second-stage reranker. Returning `null` means "keep original order"
 * (service down, timeout, or skipped) — never a hard failure for search.
 */
export interface RerankerClient {
  rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResponse | null>;
}

export class HttpRerankerClient implements RerankerClient {
  private readonly logger = new Logger(HttpRerankerClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResponse | null> {
    if (!this.baseUrl || candidates.length === 0) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/rerank`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, candidates, top_k: topK }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`reranker returned ${res.status}; keeping RRF order`);
        return null;
      }
      const data = (await res.json()) as RerankResponse;
      if (!data || data.skipped || !Array.isArray(data.results)) {
        return data?.skipped ? data : null;
      }
      return data;
    } catch (err) {
      this.logger.warn(
        `rerank request failed (${(err as Error).name}); keeping RRF order`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Deterministic test/dev client: scores by simple token overlap (mirrors the
 * Python FakeReranker). Pass `fail: true` to simulate an outage.
 */
export class FakeRerankerClient implements RerankerClient {
  constructor(private readonly fail = false) {}

  async rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number,
  ): Promise<RerankResponse | null> {
    if (this.fail) return null;
    const qTokens = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const scored = candidates.map((c) => {
      const tTokens = new Set((c.text || '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
      let overlap = 0;
      for (const t of qTokens) if (tTokens.has(t)) overlap += 1;
      const density = overlap / Math.max(qTokens.size, 1);
      return { id: c.id, score: overlap + density };
    });
    scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { results: scored.slice(0, topK), skipped: false };
  }
}

/** No-op client when reranking is not configured. */
export class NoopRerankerClient implements RerankerClient {
  async rerank(): Promise<RerankResponse | null> {
    return null;
  }
}
