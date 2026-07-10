# I4 - Object Storage (MinIO)

> S3-compatible object storage for original documents, images, and generated thumbnails. Phase 1.

## 1. Role

- Store binary/large content: original uploaded documents, source images, and generated thumbnails/derivatives.
- Serve as the snapshot repository target for Elasticsearch backups.
- Provide durable, addressable blobs referenced from ES documents (by object key/URL).

## 2. Technology

- MinIO (S3 API). Swappable for AWS S3 / GCS / Azure Blob in cloud deployments (same S3 client code).

## 3. Bucket and key design

- Per-tenant prefixing within buckets to keep isolation and lifecycle simple:
  - `content/{tenantPrefix}/{sourceId}/{docId}` - originals
  - `thumbnails/{tenantPrefix}/{docId}.jpg` - derivatives
  - `es-snapshots/` - Elasticsearch snapshots
- Object metadata carries `tenant_id` and content hash for integrity/dedup.

## 4. Access pattern

- Ingestion Workers write originals/thumbnails. The widget/gateway serve images via short-lived pre-signed URLs (never public buckets).

## 5. Configuration and deployment

- MVP: single MinIO (Compose) with a data volume and a console.
- Production: distributed MinIO (erasure coding) or managed S3; versioning + lifecycle policies.

Consumers: `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, bucket names.

## 6. Scaling and performance

- Scales horizontally (distributed MinIO) or via managed object storage.
- Use CDN in front of pre-signed thumbnail URLs for image-heavy tenants.

## 7. Resilience

- Versioning + lifecycle (expire old derivatives); erasure coding in production for durability.

## 8. Security

- Per-tenant access via scoped credentials or pre-signed URLs; no public buckets.
- Server-side encryption at rest; TLS in transit; private network.

## 9. Observability

- MinIO metrics (Prometheus): bucket sizes, request rates/errors, replication status.

## 10. Local development

- Compose MinIO with default dev credentials and a bootstrap script that creates buckets.

## 11. Implementation steps (Phase 1)

1. Add MinIO to Compose with a data volume and console.
2. Bootstrap buckets (`content`, `thumbnails`, `es-snapshots`) and lifecycle rules.
3. Wire Workers to store originals/thumbnails; implement pre-signed URL generation.
4. Configure ES snapshot repository against MinIO.

## 12. Open questions / future work

- Antivirus/malware scanning on upload.
- Client-side or field-level encryption for highly sensitive content.
- Image derivative pipeline (multiple sizes) + CDN.
