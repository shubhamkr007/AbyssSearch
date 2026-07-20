import type { S12AnswerRequest, S12AnswerResponse, S12Citation } from '../domain/types';
import { httpJson } from './http';

export const RAG_CLIENT = 'RAG_CLIENT';

export class RagUnavailableError extends Error {
  constructor(message = 'rag service unavailable') {
    super(message);
    this.name = 'RagUnavailableError';
  }
}

export interface RagClient {
  answer(req: S12AnswerRequest, correlationId?: string): Promise<S12AnswerResponse>;
}

/** Raw (snake_case) shape returned by the Python RAG service. */
interface RawRagResponse {
  query: string;
  answer: string;
  model: string;
  used_context: boolean;
  degraded: boolean;
  degraded_reasons?: string[];
  citations?: Array<{
    n: number;
    id: string;
    title?: string;
    url?: string;
    source?: string;
    score?: number;
    snippet?: string;
  }>;
}

function mapResponse(data: RawRagResponse): S12AnswerResponse {
  const citations: S12Citation[] = (data.citations ?? []).map((c) => ({
    n: c.n,
    id: c.id,
    title: c.title,
    url: c.url,
    source: c.source,
    score: c.score,
    snippet: c.snippet,
  }));
  return {
    query: data.query,
    answer: data.answer,
    model: data.model,
    usedContext: data.used_context,
    degraded: data.degraded,
    degradedReasons: data.degraded_reasons,
    citations,
  };
}

export class HttpRagClient implements RagClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async answer(req: S12AnswerRequest, correlationId?: string): Promise<S12AnswerResponse> {
    try {
      const res = await httpJson(`${this.baseUrl.replace(/\/$/, '')}/answer`, {
        method: 'POST',
        body: {
          query: req.query,
          tenant_id: req.tenantId,
          prefix: req.prefix,
          tab: req.tab,
          filters: req.filters,
          top_k: req.topK,
        },
        timeoutMs: this.timeoutMs,
        correlationId,
      });
      if (res.status !== 200) throw new RagUnavailableError(`rag returned ${res.status}`);
      return mapResponse((await res.json()) as RawRagResponse);
    } catch (err) {
      if (err instanceof RagUnavailableError) throw err;
      throw new RagUnavailableError((err as Error).message);
    }
  }
}

/** In-memory client for tests / USE_FAKE dev mode. */
export class FakeRagClient implements RagClient {
  response: S12AnswerResponse | null = null;
  fail = false;
  readonly calls: S12AnswerRequest[] = [];

  async answer(req: S12AnswerRequest): Promise<S12AnswerResponse> {
    this.calls.push(req);
    if (this.fail) throw new RagUnavailableError();
    if (this.response) return { ...this.response, query: req.query };
    return {
      query: req.query,
      answer: 'This is a fake grounded answer citing the top source [1].',
      model: 'fake-llm',
      usedContext: true,
      degraded: false,
      citations: [
        {
          n: 1,
          id: 'demo-1',
          title: 'Demo result',
          url: 'https://example.com/demo',
          source: 'document',
          snippet: 'A sample source used by the fake RAG client.',
        },
      ],
    };
  }
}
