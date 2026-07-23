# S13 - Analytics Service

Captures search behavior and serves the aggregates that drive tuning and admin
dashboards: **top queries**, **zero-result queries**, **click-through rate (CTR)**,
and **latency percentiles**. Phase 2 of the platform.

## How it fits

```
widget ──click/impression──▶ gateway /v1/events ──▶ analytics /events ──▶ ES (analytics-{tenant})
gateway (server-side) ──query event (latency, result count, zero-result)──▶ analytics
Admin Console ──▶ analytics /reports/*
```

- Event intake is **best-effort and buffered**: events land in an in-memory buffer
  and are bulk-written to Elasticsearch on a background thread. Intake never blocks
  the search path and drops/samples under pressure.
- Storage is per-tenant: `analytics-{tenant}` (e.g. `analytics-demo`). This name is
  deliberately **not** `{tenant}-*`, so analytics never pollutes content search.
- Reports are Elasticsearch aggregations, strictly scoped to the requesting tenant.

## API

Everything is gated by the shared admin token (`Authorization: Bearer <token>` or
`x-admin-token`). The gateway forwards it on `/events`; the Admin Console sends it
when reading reports.

| Method | Path | Purpose |
|---|---|---|
| POST | `/events` | Accept a batch of events `{ tenant, events: [...] }` |
| GET | `/reports/top-queries?tenant=&days=&size=` | Most frequent queries (+ avg latency, zero-result count) |
| GET | `/reports/zero-results?tenant=&days=&size=` | Queries that returned nothing (+ zero-result rate) |
| GET | `/reports/ctr?tenant=&days=&size=` | Impressions, clicks and CTR by query |
| GET | `/reports/latency?tenant=&days=` | Query latency percentiles (p50/p90/p95/p99) |
| GET | `/healthz` `/readyz` `/metrics` | Liveness, ES readiness, Prometheus metrics |

### Event shape (snake_case)

```json
{ "type": "query|impression|click",
  "query": "security policy", "tab": "all",
  "doc_id": "d1", "rank": 0,
  "result_count": 5, "latency_ms": 42, "zero_result": false,
  "session_id": "…", "ts": "2026-07-23T10:00:00Z" }
```

Only `type` is required. The `query` field is normalized (trimmed + lowercased) for
grouping; `query_raw` keeps the original.

## Local development

Reuses the ingestion virtualenv (identical deps). From the repo root the dev
scripts start it on `:8093` automatically. Standalone:

```bash
# offline, no Elasticsearch needed
USE_FAKE=true python -m uvicorn app.main:app --port 8093

# against a real ES on :9200
ELASTICSEARCH_URL=http://localhost:9200 python -m uvicorn app.main:app --port 8093
```

Send a couple of events and read a report:

```bash
curl -X POST http://localhost:8093/events -H "Authorization: Bearer dev-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"tenant":"demo","events":[{"type":"query","query":"security","result_count":3,"latency_ms":40}]}'

curl "http://localhost:8093/reports/top-queries?tenant=demo" -H "Authorization: Bearer dev-admin-token"
```

## Testing

```bash
python -m pytest services/analytics -q
```

Unit tests cover report aggregations, tenant isolation, query normalization, and
the `/events` + `/reports/*` round-trip against the in-memory store.

## Future work

- Time-based indices + ILM rollover and per-tenant retention.
- Feed popular queries into the `build-suggest` job.
- Privacy controls (opt-out, hashing/redaction) per tenant.
