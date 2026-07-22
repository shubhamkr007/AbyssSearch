# tenant-config - S4 Tenant / Config Service

System of record for **tenants, API keys, sources, tabs, and search
configuration**. It serves fast read APIs to the gateway/search plane and
admin-authenticated write APIs for onboarding and tuning, and publishes
config-change events so consumer caches invalidate promptly.

- **Stack:** NestJS + TypeScript, Prisma ORM, PostgreSQL 16, Valkey pub/sub.
- **Spec:** [`docs/services/tenant-config-service.md`](../../docs/services/tenant-config-service.md)

## API

### Internal reads (consumed by gateway / search / workers)

| Method | Path | Purpose |
|---|---|---|
| GET | `/tenants/:id` | Tenant record |
| POST | `/keys/verify` | Verify an API key -> tenant context |
| GET | `/tenants/:id/config` | Aggregated widget-bootstrap config (tenant + tabs + search config) |
| GET | `/tenants/:id/search-config` | Synonyms, boosts, facets, suggest settings |
| GET | `/tenants/:id/sources` | Source definitions |

### Admin reads / writes (require admin credentials)

| Method | Path | Purpose |
|---|---|---|
| GET | `/tenants` | List tenants |
| GET | `/tenants/:id/keys` | List API-key metadata (never the secret/hash) |
| POST | `/tenants` | Create tenant (allocates immutable `prefix`) |
| POST | `/tenants/:id/keys` | Issue an API key (secret returned once) |
| DELETE | `/tenants/:id/keys/:keyId` | Revoke an API key |
| PUT | `/tenants/:id/tabs` | Replace tab configuration |
| PUT | `/tenants/:id/search-config` | Tune relevance |
| POST | `/tenants/:id/sources` | Register a source/connector |

### Operational

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness (Postgres required, Valkey best-effort) |
| GET | `/metrics` | Prometheus metrics |

### Examples

```bash
# create a tenant (admin)
curl -sX POST localhost:8000/tenants \
  -H 'x-admin-token: change-me-in-dev' -H 'content-type: application/json' \
  -d '{"name":"ACME Corp","prefix":"acme"}'

# issue an API key (the plaintext "key" is shown ONLY in this response)
curl -sX POST localhost:8000/tenants/<TENANT_ID>/keys \
  -H 'x-admin-token: change-me-in-dev' -H 'content-type: application/json' \
  -d '{"scopes":["search","suggest"],"rateLimit":120}'

# verify a key (internal)
curl -sX POST localhost:8000/keys/verify \
  -H 'content-type: application/json' -d '{"key":"pk_live_..."}'
```

## Configuration (env)

See [`.env.example`](.env.example). Key variables:

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8000` | HTTP port |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `REDIS_URL` | - | Valkey URL; empty disables pub/sub (graceful) |
| `ADMIN_TOKEN` | - | **Required** shared secret for admin routes (Phase 1 placeholder) |
| `CONFIG_EVENT_CHANNEL` | `config:invalidate` | Pub/sub channel for invalidation events |
| `USE_IN_MEMORY` | `false` | Run without Postgres (dev/demo; data not persisted) |

## Local development

Bring up **Postgres with a persistent Docker volume**, migrate, then run the service:

```powershell
# From repo root — starts es-postgres + applies Prisma migrations
powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1
# Optional demo tenant:
powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1 -Seed
```

```bash
cd services/tenant-config
cp .env.example .env                                    # ADMIN_TOKEN + DATABASE_URL
# DATABASE_URL already matches infra/docker-compose.yml
pnpm start:dev                                          # default PORT=8000; stack uses 8001
```

Or let the full stack do it: `scripts\dev-up.ps1 -RealConfig` (S4 on :8001,
`USE_IN_MEMORY=false`, gateway pointed at real config).

`USE_IN_MEMORY=true` remains available for **unit/e2e tests and offline demos**
only — data is lost on restart and is not the default for `-RealConfig`.

Stop Postgres (keep data): `scripts\pg-down.ps1`  
Wipe data: `scripts\pg-down.ps1 -Wipe`

## Security notes

- API keys are stored **only** as argon2id hashes; the `key_prefix` is kept in
  clear for display and candidate lookup. The full secret is returned exactly
  once at issuance.
- Admin auth is a **Phase 1 placeholder** (shared `ADMIN_TOKEN`). Phase 3
  swaps it for JWT/OIDC + RBAC (see [`docs/services/admin-api.md`](../../docs/services/admin-api.md)).
  Admin routes reject all requests when `ADMIN_TOKEN` is unset.
- Every admin mutation writes an `audit_log` entry (never containing secrets).
- The tenant `prefix` is validated and immutable after creation to protect ES
  index isolation.

## Tests

```bash
pnpm test          # unit + e2e (fully in-memory; no Postgres/Valkey needed)
pnpm lint          # tsc --noEmit typecheck
```

Tests use an in-memory repository and a no-op cache publisher, mirroring the
fake-backend pattern in the Python `analysis-ml` service, so the suite is fast
and hermetic. Integration tests against an ephemeral Postgres (Testcontainers)
are a documented follow-up.

## Notes / follow-ups

- **Schema layout:** MVP tables live in the default Postgres schema for
  frictionless local dev. The master plan separates `config` and `ingestion`
  schemas with per-service roles; splitting into a dedicated `config` schema
  (Prisma multiSchema) lands with the ingestion service.
- Extract the Admin API (S10) into its own deployable (Phase 2).
- Config versioning + draft/published rollout (Phase 2/3).
