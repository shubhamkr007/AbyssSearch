import type { EsSearchResult, JsonObject } from '../domain/types';

/** DI token so the Elasticsearch client is swappable with a fake in tests. */
export const SEARCH_BACKEND = 'SEARCH_BACKEND';

/**
 * Executes a builder-produced query body against a resolved index/alias and
 * returns a normalized result. Implementations must never surface raw ES DSL
 * or client errors as-is; timeouts/errors are represented via thrown errors
 * that the service translates into `degraded` responses.
 */
export interface SearchBackend {
  search(index: string, body: JsonObject): Promise<EsSearchResult>;
  ping(): Promise<boolean>;
}
