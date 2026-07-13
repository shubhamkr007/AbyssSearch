import { Logger } from '@nestjs/common';

export const EMBEDDING_CLIENT = 'EMBEDDING_CLIENT';

/**
 * Fetches a query embedding from the Analysis/ML service (S8). Returning `null`
 * (rather than throwing) signals the caller to degrade to BM25-only search.
 */
export interface EmbeddingClient {
  embedQuery(text: string): Promise<number[] | null>;
}

export class HttpEmbeddingClient implements EmbeddingClient {
  private readonly logger = new Logger(HttpEmbeddingClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async embedQuery(text: string): Promise<number[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: [text], type: 'query' }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`embedding service returned ${res.status}; degrading to BM25-only`);
        return null;
      }
      const data = (await res.json()) as { vectors?: number[][] };
      const vector = data?.vectors?.[0];
      return Array.isArray(vector) ? vector : null;
    } catch (err) {
      this.logger.warn(
        `embedding request failed (${(err as Error).name}); degrading to BM25-only`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Test/dev embedder. Pass `null` to simulate an embedding-service outage. */
export class FakeEmbeddingClient implements EmbeddingClient {
  constructor(private readonly vector: number[] | null = new Array(8).fill(0.1)) {}

  async embedQuery(): Promise<number[] | null> {
    return this.vector;
  }
}
