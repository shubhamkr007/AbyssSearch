# I2 - PostgreSQL

> System of record for configuration/tenant data and ingestion job metadata. Phase 1.

## 1. Role

- Stores all configuration and multi-tenant metadata (owned by the Tenant/Config Service): tenants, API keys, sources, tab config, search config, audit log, schedules.
- Stores ingestion job metadata (owned by the Ingestion Orchestrator): jobs, tasks, checkpoints, dead-letter.

## 2. Version

- PostgreSQL 16.

## 3. Schema organization

- Schema `config` (Tenant/Config Service) and schema `ingestion` (Ingestion Orchestrator). Database-per-service is emulated via separate schemas + separate DB roles with least privilege; can split into separate databases/instances later.
- Migrations: Prisma (config) and Alembic (ingestion). Backward-compatible, gated in CI/CD.

Representative tables (full DDL in the master plan Data architecture section):

```
config.tenants(id, name, prefix, status, created_at)
config.api_keys(id, tenant_id, key_hash, scopes, origin_allowlist, rate_limit, active, created_at)
config.sources(id, tenant_id, type, name, connector_config, schedule, enabled)
config.tab_config(id, tenant_id, tab_key, label, source_filter, position, enabled)
config.search_config(id, tenant_id, synonyms, boosts, facets, suggest_config)
config.audit_log(id, tenant_id, actor, action, before, after, created_at)
ingestion.jobs(id, tenant_id, source_id, type, status, counts, created_at, finished_at)
ingestion.tasks(id, job_id, kind, status, attempts, error, updated_at)
ingestion.dead_letter(id, task_id, payload, error, created_at)
```

## 4. Multi-tenancy

- `tenant_id` on every tenant-scoped row; indexes on `(tenant_id, ...)`.
- Optional Row-Level Security (RLS) policies for stronger isolation (Phase 3).

## 5. Configuration and deployment

- MVP: single instance (Compose) with a data volume.
- Production: primary + replica, connection pooling (PgBouncer), WAL archiving for PITR.

Consumers: `DATABASE_URL` per owning service (distinct roles/schemas).

## 6. Scaling and performance

- Read replicas for read-heavy config lookups (though most reads are cached in Valkey).
- Proper indexing; partition large `ingestion.tasks`/`audit_log` by time if needed.

## 7. Backup and recovery

- Automated base backups + WAL archiving; regular restore drills. Logical dumps for portability.

## 8. Security

- Least-privilege roles per schema/service; TLS; secrets via env/secret store; no shared superuser in apps.
- API keys stored only as argon2id hashes.

## 9. Observability

- Metrics via `postgres_exporter`: connections, slow queries, cache hit ratio, replication lag, deadlocks.

## 10. Local development

- Compose Postgres with an init script that creates schemas/roles; `prisma migrate dev` + `alembic upgrade head`; seed a demo tenant.

## 11. Implementation steps (Phase 1)

1. Add Postgres to Compose with schemas `config` and `ingestion` and per-service roles.
2. Author Prisma schema/migration (config) and Alembic migration (ingestion).
3. Seed demo tenant, source, tabs, search-config, and a public API key.
4. Add `postgres_exporter` for metrics.

## 12. Open questions / future work

- Row-Level Security enforcement (Phase 3).
- Split `ingestion` to its own database/instance as volume grows.
- Managed Postgres (RDS/Cloud SQL) in cloud deployments.
