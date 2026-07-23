import type { AnalyticsEvent } from '../domain/types';
import { httpJson } from './http';

export const ANALYTICS_CLIENT = 'ANALYTICS_CLIENT';

export class AnalyticsUnavailableError extends Error {
  constructor(message = 'analytics service unavailable') {
    super(message);
    this.name = 'AnalyticsUnavailableError';
  }
}

export interface AnalyticsClient {
  /** Best-effort: forward a batch of events for a tenant. May throw; callers fire-and-forget. */
  record(prefix: string, events: AnalyticsEvent[], correlationId?: string): Promise<void>;
}

/** Map the gateway's camelCase event to the analytics service snake_case contract. */
function toWire(e: AnalyticsEvent): Record<string, unknown> {
  return {
    type: e.type,
    query: e.query,
    tab: e.tab,
    doc_id: e.docId,
    rank: e.rank,
    result_count: e.resultCount,
    latency_ms: e.latencyMs,
    zero_result: e.zeroResult,
    session_id: e.sessionId,
    ts: e.ts,
  };
}

export class HttpAnalyticsClient implements AnalyticsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly adminToken: string,
  ) {}

  async record(prefix: string, events: AnalyticsEvent[], correlationId?: string): Promise<void> {
    if (events.length === 0) return;
    try {
      const res = await httpJson(`${this.baseUrl.replace(/\/$/, '')}/events`, {
        method: 'POST',
        body: { tenant: prefix, events: events.map(toWire) },
        timeoutMs: this.timeoutMs,
        correlationId,
        headers: this.adminToken ? { authorization: `Bearer ${this.adminToken}` } : undefined,
      });
      if (res.status < 200 || res.status >= 300) {
        throw new AnalyticsUnavailableError(`analytics returned ${res.status}`);
      }
    } catch (err) {
      if (err instanceof AnalyticsUnavailableError) throw err;
      throw new AnalyticsUnavailableError((err as Error).message);
    }
  }
}

/** In-memory client for tests / USE_FAKE dev mode (records calls, never fails). */
export class FakeAnalyticsClient implements AnalyticsClient {
  readonly calls: Array<{ prefix: string; events: AnalyticsEvent[] }> = [];
  fail = false;

  async record(prefix: string, events: AnalyticsEvent[]): Promise<void> {
    this.calls.push({ prefix, events });
    if (this.fail) throw new AnalyticsUnavailableError();
  }
}
