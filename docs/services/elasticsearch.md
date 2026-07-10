# I1 - Elasticsearch

> The search engine and vector store. Owns content indices, hybrid retrieval, suggestions, and vectors. Phase 1.

## 1. Role

- Primary datastore for searchable content and dense vectors.
- Executes BM25 and kNN (`dense_vector` + HNSW) queries, aggregations (facets), highlighting, `search_as_you_type`, `completion` suggester, and `phrase`/`term` suggesters (did-you-mean). Hybrid fusion (RRF) is performed **client-side** by the Search Service (see licensing below).

## 2. Version and licensing

- **Elasticsearch 8.16+, free Basic tier, $0.** Since 8.16 the core is available under **AGPLv3** (in addition to SSPL/ELv2), so it qualifies as open source; the Basic distribution carries no license fee.
- **Included free in Basic (everything this platform needs):** BM25, `dense_vector` + HNSW kNN, aggregations, highlighting, suggesters, `search_as_you_type`, TLS, authentication, and API keys.
- **Gated to the paid Enterprise tier (all avoided here):**
  - Native `rrf` retriever (returns HTTP 403 on Basic) and the linear retriever -> **hybrid search uses client-side RRF** in the Search Service (see [search-service.md](search-service.md)); no license needed.
  - ELSER sparse vectors -> **not required**, because embeddings are self-hosted (Embedding Service).
  - Document-/field-level security and SSO (SAML/OIDC) -> **per-user document ACLs are enforced at the application layer** instead.

## 3. Index design

- One index per tenant per source type, behind a read alias for zero-downtime reindex: physical `acme-documents-v1` -> alias `acme-documents`. Prefix pattern `{tenantPrefix}-{sourceType}-{version}`.
- Chunk index per tenant for RAG: `{prefix}-chunks-vN`.
- Analytics indices are time-based with ILM: `{prefix}-analytics-*`.
- Index templates define mappings and analyzers so new tenant indices are consistent. Full mapping details live in the master plan (Data architecture) and appendices.

Key fields: `tenant_id` (keyword), `source` (keyword), `title`/`body` (text, with `copy_to` a semantic/aggregate field), `tags` (keyword), `metadata` (object/flattened), `entities` (keyword), `embedding` (`dense_vector`, dim 384, cosine), date fields, plus source-specific fields (image/news).

## 4. Multi-tenancy and isolation

- Alias-per-tenant read scoping + a mandatory `tenant_id` term filter on every query (defense-in-depth).
- Least-privilege API keys per service (read for query, write for ingestion) restricted to the tenant index pattern.
- Tenant-level isolation uses only Basic-tier features (indices/aliases, filters, API keys). Per-user document-level ACLs are enforced in the application layer, since native document/field-level security is Enterprise-only.

## 5. Configuration and deployment

- MVP: single node (Compose) with security enabled and a bootstrap password/API keys. Volume-backed data.
- Production: 3+ data nodes + dedicated masters, HNSW parameters tuned (`m`, `ef_construction`), shard/replica strategy per tenant size, ILM for time-based indices, snapshots to object storage.

Env/consumers: `ELASTICSEARCH_URL`, `ELASTICSEARCH_API_KEY` (per service).

## 6. Scaling and performance

- Scale reads with replicas; scale capacity with data nodes.
- Tune `num_candidates`/`k` for kNN recall vs latency; benchmark hybrid vs BM25/vector-only.
- Use `search_after` for deep pagination; cap `from + size`.
- Force-merge read-only reindex targets before alias swap.

## 7. Backup and recovery

- Snapshot repository (MinIO/S3); scheduled snapshots + tested restores.
- Blue-green reindex via versioned indices and alias swap.

## 8. Security

- TLS + authentication enabled; per-service API keys with minimal privileges; no anonymous access (all free in Basic).
- Network-restricted (private) - never exposed publicly.
- SSO (SAML/OIDC) is a paid feature and is not used; admin authentication is handled by the Admin API's own OIDC/JWT layer, not Elasticsearch security.

## 9. Observability

- Kibana + Elasticsearch monitoring; cluster health, JVM/heap, search/index latency, rejected threads, kNN timings.

## 10. Local development

- Compose single node with `xpack.security` enabled and seeded API keys; Kibana attached for Dev Tools.

## 11. Implementation steps (Phase 1)

1. Add ES + Kibana to Compose with security and a data volume.
2. Create index templates (mappings + analyzers) and the alias convention.
3. Provision per-service API keys (read/write) scoped to index patterns.
4. Seed a demo tenant's indices and validate hybrid queries in Kibana.

## 12. Open questions / future work

- Cross-cluster search for regional data residency.
- Per-tenant dedicated indices vs shared index with routing for very small tenants (cost trade-off).
- Optional migration to OpenSearch (Apache-2.0) if native hybrid/RRF or free document/field-level security are later wanted at no cost.
