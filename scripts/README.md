# Local dev stack scripts

Run the whole backend locally with one command. Each service starts in **its own
window** via `Start-Process`, so they run independently — one crashing no longer
takes the others down, and they survive the shell that launched them.

## Prerequisites

- **Elasticsearch** running natively on `http://localhost:9200` (security disabled for dev).
- Node services built once and Python venvs created:
  - `services/search-service/dist` and `services/api-gateway/dist` (the script builds these if missing).
  - `services/analysis-ml/.venv` and `services/ingestion/.venv` with dependencies installed.

## Usage

```powershell
# Start everything (NER-only analysis-ml; search runs BM25-only)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1

# Start with embeddings too (hybrid BM25 + kNN search)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings

# Force a rebuild of the Node services first
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Build

# Check health of ES + all four services
powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1

# Stop everything and close the windows
powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1
```

## Ports

| Service | Port | Notes |
|---|---|---|
| analysis-ml (embedding + NER) | 8000 | `/docs` for Swagger UI |
| search-service | 8080 | tenant-scoped hybrid retrieval |
| api-gateway (BFF) | 8081 | **point the widget's `api-base` here** |
| ingestion (orchestrator) | 8090 | `/docs`; `ANALYZE` + ingest jobs |
| elasticsearch | 9200 | run natively (not managed by these scripts) |

## Notes

- The gateway runs with **seeded fake config** (`USE_FAKE_CONFIG=true`) and **real search**
  (`USE_FAKE_SEARCH=false`). Use the demo tenant key `pk_test_demo` as
  `Authorization: Bearer pk_test_demo`. Example query (the search body field is `query`):

  ```bash
  curl -X POST http://localhost:8081/v1/search \
    -H "Authorization: Bearer pk_test_demo" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"security\"}"
  ```
- Without `-Embeddings`, `analysis-ml` loads NER only; the search service detects the
  missing embedder and gracefully degrades to BM25-only. NER enrichment (`/jobs/analyze`)
  still works.
- These scripts target Windows PowerShell. For containerized parity later, see
  `infra/docker-compose.yml` (Postgres/Valkey/Elasticsearch).
