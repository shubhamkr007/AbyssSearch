# I4 - Object Storage (MinIO)

> S3-compatible object storage for original documents, images, and generated thumbnails — and the first **document connector** target for Epic 2.2.

## 1. Role

- Store binary/large content: original uploaded documents, source images, and generated thumbnails/derivatives.
- Serve as the snapshot repository target for Elasticsearch backups.
- Provide durable, addressable blobs referenced from ES documents (by object key/URL).
- **Connector sync:** Admin-registered `s3` sources list/get objects from MinIO (or AWS S3) and upsert into `{prefix}-document`.

## 2. Technology

- MinIO (S3 API). Swappable for AWS S3 / GCS / Azure Blob in cloud deployments (same S3 client code / `boto3`).

## 3. Bucket and key design

- Bootstrap buckets (local): `content`, `thumbnails`, `es-snapshots`.
- Per-tenant prefixing within buckets:
  - `content/{tenantPrefix}/{sourceId}/{docId}` — originals (future write-back)
  - Connector reads arbitrary prefixes (e.g. `demo/handbook/`) configured per source
  - `thumbnails/{tenantPrefix}/{docId}.jpg` — derivatives
  - `es-snapshots/` — Elasticsearch snapshots

## 4. Access pattern

- Ingestion Workers / Orchestrator read objects via the S3 connector (`ListObjectsV2` + `GetObject`).
- Widget/gateway serve images via short-lived pre-signed URLs (never public buckets) — Phase follow-up.

## 5. Configuration and deployment

- Local: Compose MinIO on `:9000` (API) / `:9001` (console), root `minioadmin` / `minioadmin`.
- Start with `.\scripts\dev-up.ps1 -MinIO` (or `.\scripts\minio-up.ps1`); bootstrap creates buckets.
- Platform fallbacks on ingestion: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_REGION`.
- Per-source credentials live in S4 `connectorConfig` (`accessKeyId` / `secretAccessKey`); list/get responses redact secrets unless `includeSecrets=true` (admin).

### Example connectorConfig

```json
{
  "endpoint": "http://127.0.0.1:9000",
  "bucket": "content",
  "prefix": "demo/handbook/",
  "region": "us-east-1",
  "accessKeyId": "minioadmin",
  "secretAccessKey": "minioadmin",
  "usePathStyle": true,
  "includeSuffixes": [".txt", ".md", ".pdf"],
  "maxKeys": 500
}
```

## 6. Sync behaviour (ingestion)

| Mode | Behaviour |
|---|---|
| `full` | List all matching keys → upsert → **delete** ES docs for this `source_id` whose keys disappeared |
| `incremental` | Upsert objects with `LastModified` newer than checkpoint cursor (no deletes) |

Natural key = object key relative to `prefix`. Indexed `source` is always `document` so Documents tabs keep working.

## 7. Scaling and performance

- Scales horizontally (distributed MinIO) or via managed object storage.
- Use CDN in front of pre-signed thumbnail URLs for image-heavy tenants.

## 8. Resilience

- Versioning + lifecycle (expire old derivatives); erasure coding in production for durability.
- Ingestion checkpoints (`source_id` + cursor JSON) survive process restarts.

## 9. Security

- Per-tenant access via scoped credentials or pre-signed URLs; no public buckets.
- S4 never returns raw `secretAccessKey` on list/default GET.
- Server-side encryption at rest; TLS in transit; private network.

## 10. Observability

- MinIO metrics (Prometheus): bucket sizes, request rates/errors, replication status.

## 11. Local development

```powershell
.\scripts\minio-up.ps1
# console: http://127.0.0.1:9001  (minioadmin / minioadmin)
```

Then create an `s3` source in Admin Console → **Test** → **Run sync**.

## 12. Open questions / future work

- Antivirus/malware scanning on upload.
- Writing originals back to MinIO from inline ingest.
- OCR / image pipelines; Celery beat schedules for connectors.
- Client-side or field-level encryption for highly sensitive content.
