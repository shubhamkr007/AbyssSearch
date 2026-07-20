# AbyssSearch — Enterprise Search Platform

Multi-tenant, embeddable enterprise search. Drop a Web Component into any app, index documents into Elasticsearch, and search with **keyword + semantic (hybrid)** ranking. Optional **RAG Answers** produce cited responses from your own content using a self-hosted LLM (Ollama).

Everything in this stack is **open-source / zero license cost**.

## What’s included

| Layer | Components |
|---|---|
| **Widget (S1)** | `<enterprise-search>` Web Component (React + Vite + shadow DOM) |
| **Gateway (S2)** | NestJS BFF — auth, rate limits, `/v1/search`, `/v1/answers`, … |
| **Search (S3)** | NestJS — BM25 + kNN, client-side RRF, suggest, did-you-mean, facets |
| **Config (S4)** | NestJS + Prisma — tenants, API keys, tabs (in-memory or Postgres) |
| **Ingestion (S5/S6)** | FastAPI + Celery-ready — ingest, enrich, `ANALYZE` (NER) jobs |
| **Analysis-ML (S8/S9)** | FastAPI — embeddings (`bge-small-en-v1.5`) + NER (spaCy) |
| **RAG (S12)** | FastAPI — hybrid retrieve + grounded answers with citations |
| **Data** | Elasticsearch (search/vectors); Postgres/SQLite for config/jobs |

Full architecture and roadmap: [`PROJECT_PLAN.md`](PROJECT_PLAN.md) · per-service specs: [`docs/services/`](docs/services/README.md)

## Prerequisites

- **Node.js 20+** and **pnpm 9**
- **Python 3.11+** (venvs under `services/analysis-ml` and `services/ingestion`)
- **Elasticsearch** on `http://localhost:9200` (security can be disabled for local dev)
- Optional: **Ollama** for generative Answers (`ollama pull llama3.2:1b`)

## Quick start (Windows)

```powershell
# 1) Start Elasticsearch natively on :9200

# 2) Start the backend stack (hybrid search + RAG Answers)
powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -Rag

# 3) Widget dev host
pnpm --filter @enterprise-search/widget dev
```

Open the **real** backend in the browser:

```
http://localhost:5173/?api=http://localhost:8081&key=pk_test_demo
```

Without `?api=` / `?key=` the widget uses offline demo data.

Stop / status:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1
powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1
```

More flags and details: [`scripts/README.md`](scripts/README.md)

## Ports

| Service | Port | Notes |
|---|---|---|
| analysis-ml | 8000 | `/docs` — embed + NER |
| tenant-config (optional `-RealConfig`) | 8001 | in-memory S4 |
| search-service | 8080 | hybrid retrieval |
| **api-gateway** | **8081** | widget `api-base` |
| ingestion | 8090 | `/docs` — ingest + analyze |
| rag | 8092 | `/docs` — answers |
| elasticsearch | 9200 | run natively |

## Embed the widget

```html
<script type="module" src="./enterprise-search.js"></script>
<enterprise-search
  tenant-key="pk_test_demo"
  api-base="http://localhost:8081"
  placeholder="Search">
</enterprise-search>
```

See [`apps/widget/README.md`](apps/widget/README.md) for attributes, events, and theming.

## Useful API examples

Demo key: `pk_test_demo` (scopes: `search`, `rag`).

```bash
# Hybrid search
curl -X POST http://localhost:8081/v1/search \
  -H "Authorization: Bearer pk_test_demo" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"security\",\"size\":5}"

# Browse all docs (blank query)
curl -X POST http://localhost:8081/v1/search \
  -H "Authorization: Bearer pk_test_demo" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"\",\"size\":50}"

# RAG answers (extractive if Ollama is offline; cited either way)
curl -X POST http://localhost:8081/v1/answers \
  -H "Authorization: Bearer pk_test_demo" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"how do I get reimbursed for travel\",\"topK\":3}"
```

## Key features (current)

- Multi-tenant isolation (per-tenant indices + mandatory `tenant_id` filter)
- Hybrid search (BM25 + dense vectors, client-side RRF on Elasticsearch Basic)
- Autosuggest, did-you-mean, facets, NER entity chips in the UI
- Highlighted match terms (`<em>`) in result snippets
- Blank search = browse all tenant documents
- Post-index NER via `POST /jobs/analyze`
- Answers tab with grounded citations (Ollama optional)

## Repo layout

```text
apps/widget/           # S1 embeddable search UI
services/
  api-gateway/         # S2 BFF
  search-service/      # S3 query plane
  tenant-config/       # S4 config / admin API
  ingestion/           # S5 orchestrator + S6 workers
  analysis-ml/         # S8 embedding + S9 NER
  rag/                 # S12 RAG answers
scripts/               # dev-up / dev-down / dev-status / verify-gaps
infra/                 # docker-compose (Postgres, Valkey, Elasticsearch)
docs/services/         # service specifications
PROJECT_PLAN.md        # architecture + roadmap
```

## License / cost

Designed to run entirely on free, open-source components (Elasticsearch Basic, PostgreSQL, Valkey, MinIO, spaCy, sentence-transformers, Ollama). See `PROJECT_PLAN.md` §2.4 for the licensing table.
