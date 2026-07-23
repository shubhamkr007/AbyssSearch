# search-service - S3 Search Service

Tenant-scoped **hybrid retrieval** over Elasticsearch: it runs a BM25 (`multi_match`)
query and a kNN (`dense_vector`) query, then fuses them with **client-side Reciprocal
Rank Fusion (RRF)** - because the native `rrf` retriever is Elasticsearch-Enterprise-gated
(HTTP 403 on the free Basic tier). It also serves facets, highlighting, as-you-type
suggestions, and did-you-mean spelling correction.

NestJS + TypeScript, `@elastic/elasticsearch`. Query embeddings come from the
Analysis/ML service (S8); if that is unavailable the service **degrades to BM25-only**.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/search` | Hybrid search: facets, filters, paging, highlighting, did-you-mean |
| GET | `/suggest` | Word-by-word autocomplete from `auto_complete-{tenant}` (edge ngrams); title fallback if empty |
| GET | `/autocomplete` | Same as `/suggest` |
| POST | `/did-you-mean` | Spelling correction (`phrase` suggester) |
| GET | `/healthz` · `/readyz` | Liveness · readiness (pings Elasticsearch) |
| GET | `/metrics` | Prometheus metrics |

### Example

```bash
curl -s localhost:8080/search -H 'content-type: application/json' -d '{
  "tenant": "acme",
  "q": "quarterly revenue",
  "tab": "documents",
  "filters": { "tags": ["finance"] },
  "page": 1,
  "size": 10
}'
```

Response (abridged):

```json
{
  "query": "quarterly revenue",
  "tab": "documents",
  "total": 42,
  "hybridMode": "client_rrf",
  "degraded": false,
  "results": [{ "id": "...", "score": 0.031, "title": "...", "snippet": "...", "highlights": {} }],
  "facets": { "tags": [{ "value": "finance", "count": 12 }] },
  "didYouMean": null,
  "timings": { "embedMs": 8, "esMs": 21, "totalMs": 31 }
}
```

## How hybrid search works

1. Resolve the read alias from `tenant` + `tab` (`{prefix}-{sourceType}`, or `{prefix}-*` for "all").
2. Fetch the query embedding from S8 (cached in an in-process LRU).
3. Run BM25 (window = `RRF_RANK_WINDOW`, with facets + highlight + did-you-mean) **and** kNN in parallel.
4. Fuse by rank: `score(doc) = Σ 1 / (RRF_RANK_CONSTANT + rank)`; sort; paginate.
5. Map hits into the stable contract. Every query carries a **mandatory `tenant_id` filter**.

Set `HYBRID_MODE=native_rrf` on a licensed cluster to send a single `retriever.rrf`
request instead; on any failure it falls back to client-side RRF.

## Configuration

See [`.env.example`](.env.example). Key vars: `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY`,
`EMBEDDING_SERVICE_URL`, `HYBRID_MODE`, `RRF_RANK_CONSTANT`, `RRF_RANK_WINDOW`, `KNN_K`,
`KNN_NUM_CANDIDATES`, `MAX_PAGE_SIZE`, `DID_YOU_MEAN_THRESHOLD`, `USE_FAKE`.

## Local development

```bash
# from repo root
pnpm install
docker compose -f infra/docker-compose.yml up -d elasticsearch   # or podman compose

# run the service
pnpm --filter @enterprise-search/search-service start:dev
```

No Elasticsearch handy? Run against in-memory fakes (returns empty result sets, but
the API, validation, and health endpoints work):

```bash
USE_FAKE=true pnpm --filter @enterprise-search/search-service start:dev
```

## Tests

```bash
pnpm --filter @enterprise-search/search-service test
```

Tests are **dependency-free**: a `FakeSearchBackend` and `FakeEmbeddingClient` stand in
for Elasticsearch and S8, so unit/e2e tests run without any containers. Coverage:

- `query-builder` - DSL shape, mandatory tenant filter, facets/highlight, suggest, native RRF.
- `rrf` - fusion ordering, window, weights, deterministic tie-break.
- `search.service` - hybrid fusion, BM25-only degradation (embedding down / kNN failure),
  full-ES-outage degradation, did-you-mean, size capping, suggest de-dup.
- `search.e2e` - HTTP contract + validation via the controllers.

## Resilience & security notes

- Embedding down or kNN failure -> **BM25-only** with `degraded: true` and a reason.
- Full Elasticsearch outage -> empty results with `degraded: true` (never a 5xx from `/search`).
- Only builder-produced queries reach Elasticsearch; no client-supplied raw DSL is executed.
- Physical indices are per-tenant (`{prefix}-{sourceType}-v{N}`); the `tenant_id` term filter is defense-in-depth on top of alias scoping.
```
