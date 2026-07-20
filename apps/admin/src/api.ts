import { useMemo } from 'react';

import { type Settings, useSettings } from './settings';

// ---- shared types -------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: string;
}

export interface ApiKeyMeta {
  id: string;
  tenantId: string;
  keyPrefix: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
  active: boolean;
  createdAt: string;
}

/** Returned once by POST /tenants/:id/keys - includes the plaintext secret. */
export interface IssuedKey extends ApiKeyMeta {
  key: string;
}

export interface Source {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  connectorConfig: Record<string, unknown>;
  schedule: string | null;
  enabled: boolean;
}

export interface Tab {
  id?: string;
  tenantId?: string;
  tabKey: string;
  label: string;
  sourceFilter?: Record<string, unknown>;
  position?: number;
  enabled?: boolean;
}

export interface SearchConfig {
  tenantId: string;
  synonyms: unknown[];
  boosts: Record<string, unknown>;
  facets: unknown[];
  suggestConfig: Record<string, unknown>;
}

export interface AggregatedConfig {
  tenant: Tenant;
  tabs: Tab[];
  searchConfig: SearchConfig;
}

export interface JobCounts {
  total: number;
  ok: number;
  failed: number;
  skipped: number;
}

export interface Job {
  jobId: string;
  tenantId: string;
  sourceId?: string | null;
  type: string;
  status: string;
  counts: JobCounts;
  taskCount: number;
  createdAt?: string | null;
  finishedAt?: string | null;
}

export interface JobCreated {
  jobId: string;
  status: string;
  taskCount: number;
}

export interface IngestDoc {
  title: string;
  body: string;
  url?: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface PreviewResultItem {
  id: string;
  title?: string;
  url?: string;
  snippet?: string;
  source?: string;
  score?: number;
  tags?: string[];
}

export interface PreviewResponse {
  query: string;
  total: number;
  took_ms: number;
  degraded: boolean;
  results: PreviewResultItem[];
}

// ---- errors -------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText;
  try {
    const body = (await res.json()) as { message?: unknown; detail?: unknown };
    const m = body.message ?? body.detail;
    if (typeof m === 'string') detail = m;
    else if (Array.isArray(m)) detail = m.map((x) => String((x as { msg?: string })?.msg ?? x)).join('; ');
    else if (m) detail = JSON.stringify(m);
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, detail);
}

// ---- client -------------------------------------------------------------

export class AdminApi {
  constructor(private readonly s: Settings) {}

  private adminHeaders(json = false): HeadersInit {
    const h: Record<string, string> = {
      authorization: `Bearer ${this.s.adminToken}`,
      'x-admin-actor': 'admin-console',
    };
    if (json) h['content-type'] = 'application/json';
    return h;
  }

  private async req<T>(url: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      throw new ApiError(0, `Network error: ${(err as Error).message}. Is the service running & CORS enabled?`);
    }
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // --- S4: tenants / keys / tabs / sources / relevance ---

  listTenants(): Promise<Tenant[]> {
    return this.req(`${this.s.adminApiBase}/tenants`, { headers: this.adminHeaders() });
  }

  createTenant(name: string, prefix: string): Promise<Tenant> {
    return this.req(`${this.s.adminApiBase}/tenants`, {
      method: 'POST',
      headers: this.adminHeaders(true),
      body: JSON.stringify({ name, prefix }),
    });
  }

  getConfig(id: string): Promise<AggregatedConfig> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/config`, { headers: this.adminHeaders() });
  }

  getSources(id: string): Promise<Source[]> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/sources`, { headers: this.adminHeaders() });
  }

  listKeys(id: string): Promise<ApiKeyMeta[]> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/keys`, { headers: this.adminHeaders() });
  }

  issueKey(
    id: string,
    body: { scopes?: string[]; originAllowlist?: string[]; rateLimit?: number },
  ): Promise<IssuedKey> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/keys`, {
      method: 'POST',
      headers: this.adminHeaders(true),
      body: JSON.stringify(body),
    });
  }

  revokeKey(id: string, keyId: string): Promise<{ revoked: boolean }> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/keys/${keyId}`, {
      method: 'DELETE',
      headers: this.adminHeaders(),
    });
  }

  setTabs(id: string, tabs: Tab[]): Promise<Tab[]> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/tabs`, {
      method: 'PUT',
      headers: this.adminHeaders(true),
      body: JSON.stringify({ tabs }),
    });
  }

  createSource(
    id: string,
    body: { type: string; name: string; schedule?: string | null; enabled?: boolean },
  ): Promise<Source> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/sources`, {
      method: 'POST',
      headers: this.adminHeaders(true),
      body: JSON.stringify(body),
    });
  }

  upsertSearchConfig(
    id: string,
    body: { synonyms?: unknown[]; boosts?: Record<string, unknown>; facets?: unknown[] },
  ): Promise<SearchConfig> {
    return this.req(`${this.s.adminApiBase}/tenants/${id}/search-config`, {
      method: 'PUT',
      headers: this.adminHeaders(true),
      body: JSON.stringify(body),
    });
  }

  // --- ingestion: ingest / analyze / jobs ---

  ingest(body: {
    tenantId: string;
    tenantPrefix?: string;
    documents: IngestDoc[];
  }): Promise<JobCreated> {
    return this.req(`${this.s.ingestBase}/jobs/ingest`, {
      method: 'POST',
      headers: this.adminHeaders(true),
      body: JSON.stringify(body),
    });
  }

  analyze(body: {
    tenantId: string;
    tenantPrefix?: string;
    source?: string | null;
    docIds?: string[];
    types?: string[] | null;
    limit?: number;
  }): Promise<JobCreated> {
    return this.req(`${this.s.ingestBase}/jobs/analyze`, {
      method: 'POST',
      headers: this.adminHeaders(true),
      body: JSON.stringify(body),
    });
  }

  listJobs(tenantId?: string, limit = 25): Promise<Job[]> {
    const q = new URLSearchParams();
    if (tenantId) q.set('tenantId', tenantId);
    q.set('limit', String(limit));
    return this.req(`${this.s.ingestBase}/jobs?${q.toString()}`, { headers: this.adminHeaders() });
  }

  // --- gateway: live search preview (uses a tenant key, not the admin token) ---

  preview(tenantKey: string, query: string, size = 10): Promise<PreviewResponse> {
    return this.req(`${this.s.gatewayBase}/v1/search`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tenantKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, size }),
    });
  }

  // --- health probes for the connection banner ---

  async health(base: string): Promise<boolean> {
    try {
      const res = await fetch(`${base}/healthz`);
      return res.ok;
    } catch {
      return false;
    }
  }
}

/** Memoized client bound to the current settings. */
export function useApi(): AdminApi {
  const { settings } = useSettings();
  return useMemo(() => new AdminApi(settings), [settings]);
}
