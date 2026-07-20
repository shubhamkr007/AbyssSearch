# S11 — Admin Console

A browser SPA (React + Vite + TanStack Query) for administering the search platform. It has **no backend of its own** — it calls the existing services directly:

- **S4 tenant-config** (`:8001`) — tenants, API keys, tabs, sources, relevance
- **S5 ingestion** (`:8090`) — ingest documents, run NER (`analyze`) jobs, view job status
- **S2 api-gateway** (`:8081`) — live search preview using a tenant key

## Run

```powershell
# Backend (real config service, in-memory store) + hybrid search
powershell -ExecutionPolicy Bypass -File ..\..\scripts\dev-up.ps1 -Embeddings -RealConfig

# Console dev server -> http://localhost:5174
pnpm --filter @enterprise-search/admin dev
```

Open http://localhost:5174 and check **Settings**: the API bases and the **admin token** (dev default `dev-admin-token`). Settings persist in this browser only (localStorage); no secrets are sent anywhere except the services you configure.

## Screens

- **Tenants** — list/create tenants; per-tenant detail with sub-tabs:
  - **API keys** — issue keys (the secret is shown **once** — copy it), revoke keys.
  - **Tabs** — add/reorder/enable the widget's search tabs.
  - **Sources** — register document sources.
  - **Relevance** — facet fields, synonyms, and field boosts.
- **Ingest** — paste a JSON array of documents and ingest them, or run **NER** over everything already indexed for the tenant; recent jobs auto-refresh.
- **Search preview** — run a real query through the gateway with a tenant key, exactly as the widget would.

## Auth (Phase 1)

Writes to S4 and ingestion are gated by a shared **admin token** (sent as a `Bearer` token). This is the current backend contract; Phase 3 replaces it with OIDC + RBAC (see `docs/services/admin-console.md`). The console is a dev/admin tool — serve it privately.

## Notes

- Documents are ingested with `tenant_id = tenant prefix` so they match the search tenant filter.
- API key **secrets** are never listed by the backend — only metadata (prefix, scopes, rate limit, status). Copy a secret when it's issued.

## Scripts

- `pnpm --filter @enterprise-search/admin dev` — dev server (`:5174`)
- `pnpm --filter @enterprise-search/admin build` — typecheck + production build
- `pnpm --filter @enterprise-search/admin lint` — typecheck only
