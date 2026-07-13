# api-gateway - S2 API Gateway / BFF

The single **public entry point** for the widget and admin console. It authenticates
tenants by API key (verified against S4), enforces an origin allowlist, per-tenant
rate limits, and strict DTO validation, then shapes and routes requests to the
Search Service (S3) and Tenant/Config Service (S4).

NestJS + TypeScript (Express adapter), `helmet`, CORS, `pino`. Downstream clients are
ports (`ConfigClient`, `SearchClient`) with HTTP impls **and** in-memory fakes, so the
whole gateway is testable without any running services.

## Public API (prefix `/v1`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/v1/config` | Widget bootstrap (tabs, facets) | valid key |
| POST | `/v1/search` | Hybrid search | key + `search` scope |
| GET | `/v1/suggest` | As-you-type suggestions | key + `search` scope |
| GET | `/v1/autocomplete` | Prefix completions | key + `search` scope |
| POST | `/v1/answers` | RAG answer | key + `rag` scope (501 in Phase 1) |
| GET | `/healthz` · `/readyz` · `/metrics` | Ops | none |

Auth: present the key as `Authorization: Bearer <key>` or `x-api-key: <key>`.

### Example

```bash
curl -s localhost:3000/v1/search \
  -H 'authorization: Bearer pk_live_xxx' \
  -H 'content-type: application/json' \
  -d '{ "query": "quarterly revenue", "tab": "documents", "filters": { "tags": ["finance"] } }'
```

Response envelope:

```json
{
  "query": "quarterly revenue",
  "didYouMean": null,
  "tab": "documents",
  "total": 42,
  "page": 1,
  "size": 10,
  "took_ms": 73,
  "degraded": false,
  "results": [{ "id": "doc-123", "title": "...", "snippet": "...", "url": "...", "tags": ["finance"], "score": 0.87, "source": "document" }],
  "facets": { "tags": [{ "value": "finance", "count": 30 }] }
}
```

## Request lifecycle

1. **AuthGuard** - extract key -> `ConfigClient.verifyKey` (cached, with stale fallback) -> attach `TenantContext` (`tenantId`, `prefix`, `scopes`, `rateLimit`). Enforces origin allowlist + required scopes.
2. **RateLimitGuard** - per-tenant fixed-window limiter; sets `X-RateLimit-*`, returns `429` + `Retry-After` when exceeded.
3. **GatewayService** - maps the widget request (flattening `filters`) to S3, injecting the tenant **prefix** (never raw ES DSL), and shapes the response for the widget.

## Resilience

- **Search down** -> `503` + `Retry-After` (never hangs the widget).
- **Suggest/autocomplete down** -> degrade to empty suggestions.
- **Config down** -> served from last-known-good cache when available; otherwise `503`.
- Per-downstream timeouts via `AbortController`; correlation id (`x-request-id`) propagated to all calls.
- API keys are redacted from logs.

## Configuration

See [`.env.example`](.env.example): `PORT`, `CONFIG_SERVICE_URL`, `SEARCH_SERVICE_URL`,
`RATE_LIMIT_DEFAULT`, `CONFIG_CACHE_TTL_SECONDS`, `KEY_CACHE_TTL_SECONDS`,
`DOWNSTREAM_TIMEOUT_MS`, `USE_FAKE`.

## Local development

```bash
pnpm install

# Option A: against real downstreams (run S4 on :8000 and S3 on :8080 first)
pnpm --filter @enterprise-search/api-gateway start:dev

# Option B: seeded fakes (no downstreams). Use the demo key below.
USE_FAKE=true pnpm --filter @enterprise-search/api-gateway start:dev
#   curl -s localhost:3000/v1/search -H 'authorization: Bearer pk_test_demo' \
#        -H 'content-type: application/json' -d '{"query":"hello"}'
```

## Tests

```bash
pnpm --filter @enterprise-search/api-gateway test
```

Dependency-free (`FakeConfigClient` / `FakeSearchClient`). Coverage: auth guard
(key/origin/scope/outage), rate limiter (limit/reset/isolation), gateway service
(request mapping, filter flattening, response shaping, degradation), and e2e HTTP
(auth 401, scope 403, validation 400, rate-limit 429, search-outage 503).

## Notes / follow-ups

- Distributed rate limiting via a Valkey store (shared across replicas) - the `RateLimiter` interface is ready to swap.
- OpenTelemetry traces (`gateway -> search/config -> ES`) and circuit breakers (opossum) are Phase-1.5 hardening.
- Per-key CORS reflection and a split public/admin gateway are future work.
```
