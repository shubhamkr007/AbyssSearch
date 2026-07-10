import type {
  ApiKey,
  AuditEntry,
  SearchConfig,
  Source,
  TabConfig,
  Tenant,
} from './models';

/** DI token for the repository so implementations are swappable. */
export const TENANT_REPOSITORY = 'TENANT_REPOSITORY';

export interface CreateTenantInput {
  name: string;
  prefix: string;
}

export interface CreateApiKeyInput {
  tenantId: string;
  keyPrefix: string;
  keyHash: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
}

export interface CreateSourceInput {
  tenantId: string;
  type: string;
  name: string;
  connectorConfig: Record<string, unknown>;
  schedule: string | null;
  enabled: boolean;
}

export interface TabInput {
  tabKey: string;
  label: string;
  sourceFilter: Record<string, unknown>;
  position: number;
  enabled: boolean;
}

export interface SearchConfigInput {
  synonyms: unknown[];
  boosts: Record<string, unknown>;
  facets: unknown[];
  suggestConfig: Record<string, unknown>;
}

/**
 * The persistence contract for all config data. Exactly one service (S4) may
 * talk to the config store; everything else goes through its HTTP API.
 */
export interface TenantRepository {
  ping(): Promise<boolean>;

  createTenant(input: CreateTenantInput): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | null>;
  getTenantByPrefix(prefix: string): Promise<Tenant | null>;

  createApiKey(input: CreateApiKeyInput): Promise<ApiKey>;
  getActiveApiKeysByPrefix(keyPrefix: string): Promise<ApiKey[]>;
  setApiKeyActive(id: string, active: boolean): Promise<ApiKey | null>;

  getSources(tenantId: string): Promise<Source[]>;
  createSource(input: CreateSourceInput): Promise<Source>;

  getTabs(tenantId: string): Promise<TabConfig[]>;
  replaceTabs(tenantId: string, tabs: TabInput[]): Promise<TabConfig[]>;

  getSearchConfig(tenantId: string): Promise<SearchConfig | null>;
  upsertSearchConfig(tenantId: string, input: SearchConfigInput): Promise<SearchConfig>;

  addAudit(entry: AuditEntry): Promise<void>;
}
