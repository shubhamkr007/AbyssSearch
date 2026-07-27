# S14 - Reranker Service

Optional second-stage **cross-encoder** that reorders top-N hybrid search hits
for higher precision. Called internally by the Search Service after RRF fusion.
Never a hard dependency — on timeout/error/budget skip, search keeps the RRF order.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/rerank` | Score `(query, candidate text)` pairs and return ranked ids |
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Backend ready (model loaded / fake always ready) |
| GET | `/metrics` | Prometheus |

```bash
curl -s localhost:8094/rerank -H 'content-type: application/json' -d '{
  "query": "revenue report",
  "candidates": [
    {"id": "a", "text": "employee handbook"},
    {"id": "b", "text": "Q3 revenue report"}
  ],
  "top_k": 10
}'
```

## Config

| Env | Default | Notes |
|---|---|---|
| `PORT` | `8094` | |
| `USE_FAKE` | `false` | Lexical overlap scorer (tests / offline) |
| `BACKEND` | `local` | `local` (CrossEncoder) or `external` |
| `RERANKER_MODEL` | `BAAI/bge-reranker-base` | sentence-transformers model id |
| `DEVICE` | `cpu` | `cpu` / `cuda` |
| `MAX_CANDIDATES` | `50` | Truncate input before scoring |
| `LATENCY_BUDGET_MS` | `300` | Soft budget; skip if already exceeded |

## Local run

```powershell
cd services\reranker
python -m venv .venv
.\.venv\Scripts\pip install -e ".[dev]"
$env:USE_FAKE='true'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8094
```

Stack flag: `scripts\dev-up.ps1 -Rerank` (loads the real model on CPU; slow first start).

Enable per tenant via Admin → Relevance → boosts JSON:

```json
{ "rerankEnabled": true }
```

Or set search-service `RERANK_ENABLED=true` globally when `-Rerank` is used.

## Tests

```powershell
$env:USE_FAKE='true'
.\.venv\Scripts\python.exe -m pytest
```
