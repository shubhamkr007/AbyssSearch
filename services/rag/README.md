# RAG Service (S12)

Retrieval-Augmented Generation: given a natural-language question, it does a
**tenant-scoped hybrid retrieval** (BM25 + kNN, client-side RRF) over the same
Elasticsearch indices the ingestion pipeline writes, then asks a **self-hosted
LLM** (Ollama) to produce a concise, **cited** answer.

It reads Elasticsearch and the Embedding Service directly (per the architecture
blueprint: `RAG -> ES` and `RAG -> Embedding`), so it works even if the Search
Service is down, and it grounds answers on full passage bodies (not 200-char
snippets).

## Endpoints

| Method | Path        | Purpose                                  |
|--------|-------------|------------------------------------------|
| POST   | `/answer`   | Generate a grounded answer + citations   |
| GET    | `/healthz`  | Liveness                                 |
| GET    | `/readyz`   | Readiness (retriever must be reachable)  |
| GET    | `/metrics`  | Prometheus metrics                       |

`POST /answer` body:

```json
{ "query": "how do I get reimbursed for travel", "tenant_id": "demo", "prefix": "demo", "top_k": 5 }
```

## Degradation ladder

1. **Hybrid** (embedding + BM25 + kNN) - normal path.
2. **BM25-only** if the Embedding Service is unavailable (`embedding_unavailable`).
3. **Extractive** answer from the top source if the LLM is unavailable (`llm_unavailable`).
4. **"No results"** if retrieval returns nothing (`no_results`).

The service never raises for a normal query; it returns `degraded: true` with reasons.

## Local development

Reuses the ingestion service's virtualenv (same deps). From the repo root:

```powershell
# Offline (no ES/Ollama): fake retriever + fake LLM
$env:USE_FAKE = "true"
services\ingestion\.venv\Scripts\python -m uvicorn app.main:app --app-dir services\rag --port 8092

# Real retrieval (needs ES on :9200 + analysis-ml on :8000); LLM optional
$env:USE_FAKE = "false"
services\ingestion\.venv\Scripts\python -m uvicorn app.main:app --app-dir services\rag --port 8092
```

### Enabling real generative answers (Ollama, free)

```powershell
# 1. Install Ollama for Windows from https://ollama.com/download
# 2. Pull a small, fast model:
ollama pull llama3.2:1b
# 3. Ollama serves on http://localhost:11434 automatically. Set the model if different:
$env:OLLAMA_MODEL = "llama3.2:1b"
```

Without Ollama the service still answers - it returns the most relevant source
text (extractive) and marks the response `degraded`.

## Tests

```powershell
services\ingestion\.venv\Scripts\python -m pytest services\rag\tests -q
```
