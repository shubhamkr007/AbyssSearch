# Local dev stack scripts

Run the whole backend locally with one command. Each service starts in **its own
window** via `Start-Process`, so they run independently — one crashing no longer
takes the others down, and they survive the shell that launched them.

## Prerequisites

- **Elasticsearch** running natively on `http://localhost:9200` (security disabled for dev).
- **Docker** (native `docker.exe`, or Docker Engine inside WSL — scripts auto-detect `wsl docker`).
- Node services built once and Python venvs created:
  - `services/search-service/dist` and `services/api-gateway/dist` (the script builds these if missing).
  - `services/analysis-ml/.venv` and `services/ingestion/.venv` with dependencies installed.

## Usage

```powershell
# Start everything (NER-only analysis-ml; search runs BM25-only)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1

# Start with embeddings too (hybrid BM25 + kNN search)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings

# Start with real S4 tenant/config on Postgres (Docker, persistent volume)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -RealConfig

# Same, and seed a demo ACME tenant (prints an API key once)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -RealConfig -Seed

# Start with the RAG service + Answers tab (POST /v1/answers)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -Rag

# Force a rebuild of the Node services first
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Build

# Postgres only (persistent volume enterprise-search-pgdata)
powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1
powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1          # keep data
powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1 -Wipe    # DELETE data

# Check health of ES + all services
powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1

# Provision two tenants and verify hybrid search + tenant isolation
# (requires a stack started with -Embeddings -RealConfig)
powershell -ExecutionPolicy Bypass -File scripts\verify-gaps.ps1

# Stop everything and close the windows (Postgres container is left running;
# use pg-down.ps1 to stop it — data stays in the volume unless -Wipe)
powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1
```

## Ports

| Service | Port | Notes |
|---|---|---|
| analysis-ml (embedding + NER) | 8000 | `/docs` for Swagger UI |
| tenant-config S4 (`-RealConfig`) | 8001 | Postgres-backed; admin token `dev-admin-token` |
| search-service | 8080 | tenant-scoped hybrid retrieval |
| api-gateway (BFF) | 8081 | **point the widget's `api-base` here** |
| ingestion (orchestrator) | 8090 | `/docs`; `ANALYZE` + ingest jobs |
| rag S12 (`-Rag`) | 8092 | `/docs`; grounded answers (Answers tab) |
| postgres (`-RealConfig` / `pg-up`) | 5432 | Docker; volume `enterprise-search-pgdata` |
| elasticsearch | 9200 | run natively (not managed by these scripts) |
| admin-console S11 | 5174 | run separately: `pnpm --filter @enterprise-search/admin dev` |
| widget dev host | 5173 | run separately: `pnpm --filter @enterprise-search/widget dev` |

> The admin console and widget dev host are Vite dev servers, started via `pnpm`
> (not by `dev-up.ps1`). The console drives S4 + ingestion with the admin token,
> so start the backend with **`-RealConfig`** first.

## Modes

- **`-Embeddings`** loads the `bge-small-en-v1.5` model in analysis-ml so search is
  hybrid (BM25 + kNN + client-side RRF). Without it, the embedder is off and search
  degrades to BM25-only (still fully functional; NER `/jobs/analyze` still works).
- **`-RealConfig`** starts **Postgres in Docker** (named volume
  `enterprise-search-pgdata`), applies Prisma migrations, starts S4 on :8001 with
  `USE_IN_MEMORY=false`, and points the gateway at it. Tenants, API keys, tabs,
  sources, and relevance config **survive restarts**. On Windows without
  `docker.exe` on PATH, the scripts use Docker inside WSL automatically
  (`wsl docker ...`). Pass `-Seed` to also create a demo ACME tenant.
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
- On Windows with **Docker Engine inside WSL**, `pg-up.ps1` starts a small WSL
  keepalive so the VM is not idle-stopped (which would take Postgres with it).
  Optional: set `vmIdleTimeout=-1` under `[wsl2]` in `%UserProfile%\.wslconfig`.
- S4 DATABASE_URL uses `127.0.0.1` (not `localhost`) to avoid IPv6 `::1` misses
  against Docker’s IPv4 port publish.
