# analysis-ml - S8 Embedding + S9 NER

FastAPI enrichment service hosting two capabilities:

- **Embedding (S8)** - turns text into dense vectors; the single source of truth for the
  embedding model, dimensionality, and normalization so index- and query-time vectors match.
  Model: `BAAI/bge-small-en-v1.5` (MIT), 384-dim, cosine, via `sentence-transformers` (Apache-2.0).
- **NER (S9)** - extracts named entities (ORG, GPE, DATE, ...) for entity facets and (later)
  PII detection. Model: spaCy `en_core_web_sm` by default (MIT); `en_core_web_lg`/`_trf` are drop-in.

100% open-source, self-hosted, $0. No runtime dependencies on other services. Embedding lives in
`app/embedding/`, NER in `app/ner/`, sharing the config/logging/metrics/health scaffolding.

Specs: [`embedding-service.md`](../../docs/services/embedding-service.md),
[`ner-service.md`](../../docs/services/ner-service.md).

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/embed` | Embed a batch of texts (`type`: `query` or `passage`) |
| GET | `/model` | Embedding model name, dim, normalization, backend |
| POST | `/ner` | Extract entities from a batch of texts (optional `types` filter) |
| GET | `/ner/model` | NER model name, labels, transformer flag |
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness (canary-checks both models) |
| GET | `/metrics` | Prometheus metrics |

```bash
curl -s localhost:8000/embed -H 'content-type: application/json' \
  -d '{"texts": ["quarterly revenue"], "type": "query"}'
# -> { "model": "BAAI/bge-small-en-v1.5", "dim": 384, "normalized": true, "type": "query", "vectors": [[...]] }
```

`query` vs `passage`: bge models expect a retrieval instruction on the query only, so the
service applies the correct prefix based on `type` — callers never handle prefixes.

```bash
curl -s localhost:8000/ner -H 'content-type: application/json' \
  -d '{"texts": ["ACME Corp reported 2026 revenue in Berlin."], "types": ["ORG","GPE","DATE"]}'
# -> { "entities": [[ {"text":"ACME Corp","label":"ORG","start":0,"end":9,"score":null}, ... ]] }
```

`score` is `null` for the statistical spaCy pipelines (they do not expose calibrated
per-entity confidence); use a transformer pipeline if you need it.

## Configuration

Copy `.env.example` to `.env`.

- Embedding: `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `NORMALIZE`, `DEVICE` (`cpu`/`cuda`),
  `BACKEND` (`sentence-transformers`), `MODEL_CACHE_DIR`, `MAX_BATCH_SIZE`, `MAX_CONCURRENCY`.
- NER: `SPACY_MODEL` (default `en_core_web_sm`), `USE_TRANSFORMER`, `NER_MAX_BATCH_SIZE`,
  `NER_MAX_CONCURRENCY`, `ENTITY_TYPES` (CSV default filter), `CUSTOM_RULER_URL`.
- Shared: `PORT`, `LOG_LEVEL`, `WARM_UP`.

## Local development

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"   # Windows; use .venv/bin on macOS/Linux
.venv/Scripts/python -m spacy download en_core_web_sm
.venv/Scripts/python -m uvicorn app.main:app --reload
```

First run downloads the embedding model to `MODEL_CACHE_DIR`; the spaCy model is installed by
the `spacy download` step (swap in `en_core_web_lg`/`en_core_web_trf` as needed).

## Tests

Unit and HTTP tests use dependency-free fake backends, so they run without torch or spaCy:

```bash
.venv/Scripts/python -m pip install fastapi pydantic pydantic-settings structlog prometheus-client numpy pytest httpx
.venv/Scripts/python -m pytest
```

## Docker

```bash
docker build -t analysis-ml .
docker run -p 8000:8000 -v analysis_ml_models:/models analysis-ml
```

## Notes

- Under load each capability returns `429` (concurrency capped by `MAX_CONCURRENCY` /
  `NER_MAX_CONCURRENCY`) so callers can degrade (Search -> BM25-only; ingestion retries NER later).
- NER failures are non-fatal to ingestion: documents index without `entities` and can be re-enriched.
- Never logs request payloads; only request id, path, batch size, type, and timing.
- Caching guidance: callers (Search Service) should cache repeated/short-query vectors.
