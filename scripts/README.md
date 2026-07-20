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

# Start with real S4 tenant/config (in-memory) instead of the seeded fake config
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -RealConfig

# Start with the RAG service + Answers tab (POST /v1/answers)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -Rag

# Force a rebuild of the Node services first
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Build

# Check health of ES + all services
powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1

# Provision two tenants and verify hybrid search + tenant isolation
# (requires a stack started with -Embeddings -RealConfig)
powershell -ExecutionPolicy Bypass -File scripts\verify-gaps.ps1

# Stop everything and close the windows
powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1
```

## Ports

| Service | Port | Notes |
|---|---|---|
| analysis-ml (embedding + NER) | 8000 | `/docs` for Swagger UI |
| tenant-config S4 (`-RealConfig`) | 8001 | in-memory store; admin token `dev-admin-token` |
| search-service | 8080 | tenant-scoped hybrid retrieval |
| api-gateway (BFF) | 8081 | **point the widget's `api-base` here** |
| ingestion (orchestrator) | 8090 | `/docs`; `ANALYZE` + ingest jobs |
| rag S12 (`-Rag`) | 8092 | `/docs`; grounded answers (Answers tab) |
| elasticsearch | 9200 | run natively (not managed by these scripts) |

## Modes

- **`-Embeddings`** loads the `bge-small-en-v1.5` model in analysis-ml so search is
  hybrid (BM25 + kNN + client-side RRF). Without it, the embedder is off and search
  degrades to BM25-only (still fully functional; NER `/jobs/analyze` still works).
- **`-RealConfig`** starts the real S4 tenant/config service on :8001 with an
  **in-memory** store (no Postgres needed) and points the gateway at it, so the
  gateway performs real API-key auth + per-tenant config. In-memory state is lost on
  restart; `verify-gaps.ps1` provisions tenants/keys via the S4 admin API each run.
  To persist across restarts, run Postgres (Docker/Podman or native) and start S4
  with `USE_IN_MEMORY=false` + a `DATABASE_URL` (see `services/tenant-config/.env.example`).
- **`-Rag`** starts the RAG service (S12) on :8092 (reusing the ingestion venv) and
  sets the gateway's `RAG_ENABLED=true` so `POST /v1/answers` works and the widget's
  **Answers** tab is functional. Retrieval is tenant-scoped hybrid over the same ES;
  generation uses a self-hosted **Ollama** model if reachable. Without Ollama the
  answer degrades to the most relevant source text (extractive), so the tab still
  works. Install Ollama (free) and `ollama pull llama3.2:1b` for real generation.

## verify-gaps.ps1

Provisions two tenants (`acme`, `globex`) with real keys, ingests per-tenant docs
(with embeddings + NER), then asserts:

- **Hybrid** - a keyword-free semantic query (`"spacecraft blastoff timetable"`)
  returns the rocket doc via kNN and the response is not degraded.
- **Isolation** - a key for one tenant never returns another tenant's documents.

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
