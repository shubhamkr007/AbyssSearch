// Framework-agnostic domain models. These are the shapes the service layer and
// repositories speak; they are deliberately decoupled from Prisma-generated
// types so the data layer can be swapped (in-memory for tests, Prisma for prod).

export type JsonObject = Record<string, unknown>;
export type JsonArray = unknown[];

export interface Tenant {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  tenantId: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
  active: boolean;
  createdAt: Date;
}

export interface Source {
  id: string;
  tenantId: string;
  type: string;
  name: string;
  connectorConfig: JsonObject;
  schedule: string | null;
  enabled: boolean;
}

export interface TabConfig {
  id: string;
  tenantId: string;
  tabKey: string;
  label: string;
  sourceFilter: JsonObject;
  position: number;
  enabled: boolean;
}

export interface SearchConfig {
  tenantId: string;
  synonyms: JsonArray;
  boosts: JsonObject;
  facets: JsonArray;
  suggestConfig: JsonObject;
}

export interface AuditEntry {
  tenantId: string | null;
  actor: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

/** Resolved authentication context returned by POST /keys/verify. */
export interface TenantContext {
  tenantId: string;
  prefix: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
}
