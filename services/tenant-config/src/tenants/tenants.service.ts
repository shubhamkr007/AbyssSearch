import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  CACHE_PUBLISHER,
  type CachePublisher,
} from '../cache/cache.publisher';
import type {
  SearchConfig,
  Source,
  TabConfig,
  Tenant,
  TenantContext,
} from '../domain/models';
import {
  TENANT_REPOSITORY,
  type TenantRepository,
} from '../domain/repository';
import {
  generateApiKey,
  hashApiKey,
  keyPrefixOf,
  verifyApiKey,
} from '../keys/api-key.util';
import type {
  CreateSourceDto,
  CreateTenantDto,
  IssueKeyDto,
  TabDto,
  UpsertSearchConfigDto,
} from './dto';

export interface PublicTenant {
  id: string;
  name: string;
  prefix: string;
  status: string;
  createdAt: Date;
}

export interface IssuedKey {
  id: string;
  tenantId: string;
  keyPrefix: string;
  /** Full secret - shown exactly once, never stored in clear text. */
  key: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
  active: boolean;
  createdAt: Date;
}

/** API-key metadata safe to list (never includes the secret or its hash). */
export interface PublicApiKey {
  id: string;
  tenantId: string;
  keyPrefix: string;
  scopes: string[];
  originAllowlist: string[];
  rateLimit: number;
  active: boolean;
  createdAt: Date;
}

export interface AggregatedConfig {
  tenant: PublicTenant;
  tabs: TabConfig[];
  searchConfig: SearchConfig;
}

const EMPTY_SEARCH_CONFIG = (tenantId: string): SearchConfig => ({
  tenantId,
  synonyms: [],
  boosts: {},
  facets: [],
  suggestConfig: {},
});

@Injectable()
export class TenantsService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly repo: TenantRepository,
    @Inject(CACHE_PUBLISHER) private readonly cache: CachePublisher,
  ) {}

  // ---- reads -------------------------------------------------------------

  async getTenant(id: string): Promise<PublicTenant> {
    return this.toPublic(await this.requireTenant(id));
  }

  async listTenants(): Promise<PublicTenant[]> {
    const tenants = await this.repo.listTenants();
    return tenants.map((t) => this.toPublic(t));
  }

  async listKeys(id: string): Promise<PublicApiKey[]> {
    await this.requireTenant(id);
    const keys = await this.repo.listApiKeys(id);
    // Strip the hash; only non-sensitive metadata leaves the service.
    return keys.map((k) => ({
      id: k.id,
      tenantId: k.tenantId,
      keyPrefix: k.keyPrefix,
      scopes: k.scopes,
      originAllowlist: k.originAllowlist,
      rateLimit: k.rateLimit,
      active: k.active,
      createdAt: k.createdAt,
    }));
  }

  async verifyKey(key: string): Promise<TenantContext> {
    const candidates = await this.repo.getActiveApiKeysByPrefix(keyPrefixOf(key));
    for (const candidate of candidates) {
      if (await verifyApiKey(candidate.keyHash, key)) {
        const tenant = await this.repo.getTenant(candidate.tenantId);
        if (!tenant || tenant.status !== 'active') {
          continue;
        }
        return {
          tenantId: candidate.tenantId,
          prefix: tenant.prefix,
          scopes: candidate.scopes,
          originAllowlist: candidate.originAllowlist,
          rateLimit: candidate.rateLimit,
        };
      }
    }
    throw new UnauthorizedException('invalid or inactive API key');
  }

  async getConfig(id: string): Promise<AggregatedConfig> {
    const tenant = await this.requireTenant(id);
    const [tabs, searchConfig] = await Promise.all([
      this.repo.getTabs(id),
      this.repo.getSearchConfig(id),
    ]);
    return {
      tenant: this.toPublic(tenant),
      tabs: tabs.filter((t) => t.enabled),
      searchConfig: searchConfig ?? EMPTY_SEARCH_CONFIG(id),
    };
  }

  async getSearchConfig(id: string): Promise<SearchConfig> {
    await this.requireTenant(id);
    return (await this.repo.getSearchConfig(id)) ?? EMPTY_SEARCH_CONFIG(id);
  }

  async getSources(id: string): Promise<Source[]> {
    await this.requireTenant(id);
    return this.repo.getSources(id);
  }

  // ---- admin writes ------------------------------------------------------

  async createTenant(dto: CreateTenantDto, actor: string): Promise<PublicTenant> {
    if (await this.repo.getTenantByPrefix(dto.prefix)) {
      throw new ConflictException(`prefix '${dto.prefix}' is already in use`);
    }
    const tenant = await this.repo.createTenant({
      name: dto.name,
      prefix: dto.prefix,
    });
    // Materialize an empty search-config row so aggregation is consistent.
    await this.repo.upsertSearchConfig(tenant.id, {
      synonyms: [],
      boosts: {},
      facets: [],
      suggestConfig: {},
    });
    await this.repo.addAudit({
      tenantId: tenant.id,
      actor,
      action: 'tenant.create',
      after: this.toPublic(tenant),
    });
    await this.cache.publishInvalidation({ type: 'tenant.created', tenantId: tenant.id });
    return this.toPublic(tenant);
  }

  async issueKey(id: string, dto: IssueKeyDto, actor: string): Promise<IssuedKey> {
    await this.requireTenant(id);
    const { plaintext, keyPrefix } = generateApiKey();
    const keyHash = await hashApiKey(plaintext);
    const record = await this.repo.createApiKey({
      tenantId: id,
      keyPrefix,
      keyHash,
      scopes: dto.scopes ?? ['search'],
      originAllowlist: dto.originAllowlist ?? [],
      rateLimit: dto.rateLimit ?? 60,
    });
    await this.repo.addAudit({
      tenantId: id,
      actor,
      action: 'key.issue',
      // Never log the secret or its hash; record only non-sensitive metadata.
      after: {
        id: record.id,
        keyPrefix: record.keyPrefix,
        scopes: record.scopes,
        rateLimit: record.rateLimit,
      },
    });
    await this.cache.publishInvalidation({ type: 'keys.changed', tenantId: id });
    return {
      id: record.id,
      tenantId: record.tenantId,
      keyPrefix: record.keyPrefix,
      key: plaintext,
      scopes: record.scopes,
      originAllowlist: record.originAllowlist,
      rateLimit: record.rateLimit,
      active: record.active,
      createdAt: record.createdAt,
    };
  }

  async revokeKey(id: string, keyId: string, actor: string): Promise<{ revoked: boolean }> {
    await this.requireTenant(id);
    const updated = await this.repo.setApiKeyActive(keyId, false);
    if (!updated || updated.tenantId !== id) {
      throw new NotFoundException('API key not found for this tenant');
    }
    await this.repo.addAudit({
      tenantId: id,
      actor,
      action: 'key.revoke',
      after: { id: keyId, active: false },
    });
    await this.cache.publishInvalidation({ type: 'keys.changed', tenantId: id });
    return { revoked: true };
  }

  async setTabs(id: string, tabs: TabDto[], actor: string): Promise<TabConfig[]> {
    await this.requireTenant(id);
    const before = await this.repo.getTabs(id);
    const result = await this.repo.replaceTabs(
      id,
      tabs.map((t, index) => ({
        tabKey: t.tabKey,
        label: t.label,
        sourceFilter: t.sourceFilter ?? {},
        position: t.position ?? index,
        enabled: t.enabled ?? true,
      })),
    );
    await this.repo.addAudit({
      tenantId: id,
      actor,
      action: 'tabs.update',
      before,
      after: result,
    });
    await this.cache.publishInvalidation({ type: 'tabs.updated', tenantId: id });
    return result;
  }

  async upsertSearchConfig(
    id: string,
    dto: UpsertSearchConfigDto,
    actor: string,
  ): Promise<SearchConfig> {
    await this.requireTenant(id);
    const before = await this.repo.getSearchConfig(id);
    const result = await this.repo.upsertSearchConfig(id, {
      synonyms: dto.synonyms ?? before?.synonyms ?? [],
      boosts: dto.boosts ?? before?.boosts ?? {},
      facets: dto.facets ?? before?.facets ?? [],
      suggestConfig: dto.suggestConfig ?? before?.suggestConfig ?? {},
    });
    await this.repo.addAudit({
      tenantId: id,
      actor,
      action: 'search-config.update',
      before,
      after: result,
    });
    await this.cache.publishInvalidation({ type: 'search-config.updated', tenantId: id });
    return result;
  }

  async createSource(id: string, dto: CreateSourceDto, actor: string): Promise<Source> {
    await this.requireTenant(id);
    const source = await this.repo.createSource({
      tenantId: id,
      type: dto.type,
      name: dto.name,
      connectorConfig: dto.connectorConfig ?? {},
      schedule: dto.schedule ?? null,
      enabled: dto.enabled ?? true,
    });
    await this.repo.addAudit({
      tenantId: id,
      actor,
      action: 'source.create',
      after: source,
    });
    await this.cache.publishInvalidation({ type: 'sources.updated', tenantId: id });
    return source;
  }

  // ---- helpers -----------------------------------------------------------

  private async requireTenant(id: string): Promise<Tenant> {
    const tenant = await this.repo.getTenant(id);
    if (!tenant) {
      throw new NotFoundException(`tenant '${id}' not found`);
    }
    return tenant;
  }

  private toPublic(tenant: Tenant): PublicTenant {
    return {
      id: tenant.id,
      name: tenant.name,
      prefix: tenant.prefix,
      status: tenant.status,
      createdAt: tenant.createdAt,
    };
  }
}
