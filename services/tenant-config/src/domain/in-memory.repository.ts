import { randomUUID } from 'node:crypto';

import type {
  ApiKey,
  AuditEntry,
  SearchConfig,
  Source,
  TabConfig,
  Tenant,
} from './models';
import type {
  CreateApiKeyInput,
  CreateSourceInput,
  CreateTenantInput,
  SearchConfigInput,
  TabInput,
  TenantRepository,
} from './repository';

/**
 * Dependency-free repository used by tests (and as a fallback dev backend via
 * USE_IN_MEMORY=true). Mirrors the fake-backend pattern used in the Python
 * analysis-ml service so the suite runs without Postgres.
 */
export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants = new Map<string, Tenant>();
  private readonly apiKeys = new Map<string, ApiKey>();
  private readonly sources = new Map<string, Source>();
  private readonly tabs = new Map<string, TabConfig>();
  private readonly searchConfigs = new Map<string, SearchConfig>();
  readonly audit: AuditEntry[] = [];

  async ping(): Promise<boolean> {
    return true;
  }

  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const tenant: Tenant = {
      id: randomUUID(),
      name: input.name,
      prefix: input.prefix,
      status: 'active',
      createdAt: new Date(),
    };
    this.tenants.set(tenant.id, tenant);
    return { ...tenant };
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const tenant = this.tenants.get(id);
    return tenant ? { ...tenant } : null;
  }

  async getTenantByPrefix(prefix: string): Promise<Tenant | null> {
    for (const tenant of this.tenants.values()) {
      if (tenant.prefix === prefix) return { ...tenant };
    }
    return null;
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    const key: ApiKey = {
      id: randomUUID(),
      tenantId: input.tenantId,
      keyPrefix: input.keyPrefix,
      keyHash: input.keyHash,
      scopes: [...input.scopes],
      originAllowlist: [...input.originAllowlist],
      rateLimit: input.rateLimit,
      active: true,
      createdAt: new Date(),
    };
    this.apiKeys.set(key.id, key);
    return { ...key };
  }

  async getActiveApiKeysByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    return [...this.apiKeys.values()]
      .filter((k) => k.active && k.keyPrefix === keyPrefix)
      .map((k) => ({ ...k }));
  }

  async setApiKeyActive(id: string, active: boolean): Promise<ApiKey | null> {
    const key = this.apiKeys.get(id);
    if (!key) return null;
    key.active = active;
    return { ...key };
  }

  async getSources(tenantId: string): Promise<Source[]> {
    return [...this.sources.values()]
      .filter((s) => s.tenantId === tenantId)
      .map((s) => ({ ...s }));
  }

  async createSource(input: CreateSourceInput): Promise<Source> {
    const source: Source = { id: randomUUID(), ...input };
    this.sources.set(source.id, source);
    return { ...source };
  }

  async getTabs(tenantId: string): Promise<TabConfig[]> {
    return [...this.tabs.values()]
      .filter((t) => t.tenantId === tenantId)
      .sort((a, b) => a.position - b.position)
      .map((t) => ({ ...t }));
  }

  async replaceTabs(tenantId: string, tabs: TabInput[]): Promise<TabConfig[]> {
    for (const [id, tab] of this.tabs) {
      if (tab.tenantId === tenantId) this.tabs.delete(id);
    }
    const created = tabs.map((t) => {
      const tab: TabConfig = { id: randomUUID(), tenantId, ...t };
      this.tabs.set(tab.id, tab);
      return { ...tab };
    });
    return created.sort((a, b) => a.position - b.position);
  }

  async getSearchConfig(tenantId: string): Promise<SearchConfig | null> {
    const cfg = this.searchConfigs.get(tenantId);
    return cfg ? { ...cfg } : null;
  }

  async upsertSearchConfig(
    tenantId: string,
    input: SearchConfigInput,
  ): Promise<SearchConfig> {
    const cfg: SearchConfig = { tenantId, ...input };
    this.searchConfigs.set(tenantId, cfg);
    return { ...cfg };
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    this.audit.push(entry);
  }
}
