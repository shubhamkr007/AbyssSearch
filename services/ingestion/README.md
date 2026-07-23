# ingestion — S5 Orchestrator + S6 Workers

Control API for ingestion jobs plus the worker pipeline that **normalize → chunk →
enrich (embed + NER) → bulk-index** documents into Elasticsearch. Celery tasks share
the same pipeline code; for local/dev/`USE_FAKE` the pipeline runs **inline** (no broker).

## API (admin token required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/jobs/ingest` | Start ingest job (inline documents in MVP) |
| POST | `/jobs/analyze` | Post-index NER enrichment |
| POST | `/jobs/build-suggest` | Rebuild word autocomplete terms from titles → `auto_complete-{prefix}` |
| GET | `/jobs/{id}` | Job status + tasks |
| GET | `/jobs` | List jobs (`tenantId`, `status`) |
| POST | `/documents:bulk` | Direct bulk upsert (small batches) |
| GET | `/dead-letter` | List poisoned tasks |
| POST | `/dead-letter/{id}:replay` | Re-enqueue a dead-letter entry |
| GET | `/healthz` · `/readyz` · `/metrics` | Ops |

Auth: `Authorization: Bearer <ADMIN_TOKEN>` or `x-admin-token: <ADMIN_TOKEN>`.

### Example (fake mode)

```bash
curl -s localhost:8090/jobs/ingest \
  -H 'x-admin-token: dev-admin-token' \
  -H 'content-type: application/json' \
  -d '{
    "tenantId": "acme",
    "tenantPrefix": "acme",
    "documents": [
      {
        "title": "Q1 2026 Revenue",
        "body": "ACME Corp reported quarterly revenue in Berlin.",
        "tags": ["finance"],
        "natural_key": "q1-2026",
        "source": "document"
      }
    ],
    "options": { "chunk": true, "enrich": true }
  }'
```

Documents land in alias `{tenantPrefix}-{source}` (e.g. `acme-document`), with idempotent
ids `sha1(tenant+source+natural_key)`. On ingest, title words are also upserted into
`auto_complete-{prefix}` (edge-ngrammed) so typing `ind` suggests `india`. Rebuild with
`POST /jobs/build-suggest` for already-indexed docs.

## Pipeline

1. Normalize inline docs to the canonical ES shape.
2. Optional fixed-size chunking with overlap (RAG-friendly).
3. Enrich via Analysis/ML (`POST /embed`, `POST /ner`) — failures are non-fatal (index without enrichment).
4. Ensure index/alias + bulk upsert into Elasticsearch.

## Modes

| Env | Behavior |
|---|---|
| `USE_FAKE=true` | In-memory job store, fake ES/embed/NER — no infrastructure |
| `USE_INLINE=true` | Run pipeline in the API process (default for local) |
| `USE_INLINE=false` | Enqueue Celery tasks (`celery -A app.workers.celery_app.celery_app worker -Q ingest`) |

## Local development

```bash
cd services/ingestion
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env   # USE_FAKE=true USE_INLINE=true

uvicorn app.main:app --reload --port 8090
# docs: http://localhost:8090/docs
```

Against real Elasticsearch (still inline enrichment fakes or point at analysis-ml):

```bash
# compose up elasticsearch (+ optional valkey)
USE_FAKE=false USE_INLINE=true \
  DATABASE_URL=sqlite+pysqlite:///./ingestion.db \
  ELASTICSEARCH_URL=http://localhost:9200 \
  uvicorn app.main:app --port 8090
```

Worker process (when not inline):

```bash
celery -A app.workers.celery_app.celery_app worker -Q ingest -l info
```

## Tests

```bash
pip install -e ".[dev]"
pytest
```

Coverage: stable doc ids, chunker, pipeline runner, orchestrator (inline + SQLite repo),
HTTP API (auth, ingest, bulk, list).

## Notes / follow-ups

- Connector-based `fetch` (folder/REST) and MinIO thumbnails are Phase 1.5.
- S7 Celery beat schedules: next service after this MVP lands.
- Production should use PostgreSQL (`DATABASE_URL`) and Valkey as the Celery broker.
