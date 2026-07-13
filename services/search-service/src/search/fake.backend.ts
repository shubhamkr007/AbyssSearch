import type { EsSearchResult, JsonObject } from '../domain/types';
import type { SearchBackend } from './backend';

const EMPTY: EsSearchResult = { total: 0, hits: [], facets: {}, suggest: {} };

/**
 * Dependency-free backend for tests (and USE_FAKE dev mode). It inspects the
 * builder-produced body to decide which canned result to return, so a single
 * fake can drive the BM25 leg, the kNN leg, suggest, and did-you-mean.
 */
export class FakeSearchBackend implements SearchBackend {
  bm25: EsSearchResult = EMPTY;
  knn: EsSearchResult = EMPTY;
  native: EsSearchResult = EMPTY;
  suggest: EsSearchResult = EMPTY;
  didYouMean: EsSearchResult = EMPTY;

  /** Set to a body-keyword ('knn' | 'aggs' | ...) to throw on that leg (simulate ES failure). */
  failOn: string | null = null;

  readonly calls: Array<{ index: string; body: JsonObject }> = [];

  async search(index: string, body: JsonObject): Promise<EsSearchResult> {
    this.calls.push({ index, body });

    if ('knn' in body) {
      if (this.failOn === 'knn') throw new Error('fake knn failure');
      return clone(this.knn);
    }
    if ('retriever' in body) {
      if (this.failOn === 'retriever') throw new Error('fake retriever failure');
      return clone(this.native);
    }
    if ('aggs' in body) {
      if (this.failOn === 'aggs' || this.failOn === 'bm25') throw new Error('fake bm25 failure');
      return clone(this.bm25);
    }
    if ('suggest' in body && !('query' in body)) {
      return clone(this.didYouMean);
    }
    return clone(this.suggest);
  }

  async ping(): Promise<boolean> {
    return true;
  }
}

function clone(result: EsSearchResult): EsSearchResult {
  return structuredClone(result);
}
