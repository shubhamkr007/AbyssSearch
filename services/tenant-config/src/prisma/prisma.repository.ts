import { Injectable } from '@nestjs/common';

import type {
  ApiKey,
  AuditEntry,
  JsonArray,
  JsonObject,
  SearchConfig,
  Source,
  TabConfig,
  Tenant,
} from '../domain/models';
import type {
  CreateApiKeyInput,
  CreateSourceInput,
  CreateTenantInput,
  SearchConfigInput,
  TabInput,
  TenantRepository,
} from '../domain/repository';
import { PrismaService } from './prisma.service';

type Row = Record<string, unknown>;

@Injectable()
export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<boolean> {
    return this.prisma.ping();
  }

  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    return this.mapTenant(await this.prisma.tenant.create({ data: input }));
  }

  async getTenant(id: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { id } });
    return row ? this.mapTenant(row) : null;
  }

  async getTenantByPrefix(prefix: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { prefix } });
    return row ? this.mapTenant(row) : null;
  }

  async listTenants(): Promise<Tenant[]> {
    const rows = await this.prisma.tenant.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.mapTenant(r));
  }

  async createApiKey(input: CreateApiKeyInput): Promise<ApiKey> {
    return this.mapApiKey(await this.prisma.apiKey.create({ data: input }));
  }

  async getActiveApiKeysByPrefix(keyPrefix: string): Promise<ApiKey[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { keyPrefix, active: true },
    });
    return rows.map((r) => this.mapApiKey(r));
  }

  async setApiKeyActive(id: string, active: boolean): Promise<ApiKey | null> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) return null;
    return this.mapApiKey(
      await this.prisma.apiKey.update({ where: { id }, data: { active } }),
    );
  }

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapApiKey(r));
  }

  async getSources(tenantId: string): Promise<Source[]> {
    const rows = await this.prisma.source.findMany({ where: { tenantId } });
    return rows.map((r) => this.mapSource(r));
  }

  async createSource(input: CreateSourceInput): Promise<Source> {
    const row = await this.prisma.source.create({
      data: {
        tenantId: input.tenantId,
        type: input.type,
        name: input.name,
        connectorConfig: input.connectorConfig as object,
        schedule: input.schedule,
        enabled: input.enabled,
      },
    });
    return this.mapSource(row);
  }

  async getTabs(tenantId: string): Promise<TabConfig[]> {
    const rows = await this.prisma.tabConfig.findMany({
      where: { tenantId },
      orderBy: { position: 'asc' },
    });
    return rows.map((r) => this.mapTab(r));
  }

  async replaceTabs(tenantId: string, tabs: TabInput[]): Promise<TabConfig[]> {
    await this.prisma.$transaction([
      this.prisma.tabConfig.deleteMany({ where: { tenantId } }),
      this.prisma.tabConfig.createMany({
        data: tabs.map((t) => ({
          tenantId,
          tabKey: t.tabKey,
          label: t.label,
          sourceFilter: t.sourceFilter as object,
          position: t.position,
          enabled: t.enabled,
        })),
      }),
    ]);
    return this.getTabs(tenantId);
  }

  async getSearchConfig(tenantId: string): Promise<SearchConfig | null> {
    const row = await this.prisma.searchConfig.findUnique({ where: { tenantId } });
    return row ? this.mapSearchConfig(row) : null;
  }

  async upsertSearchConfig(
    tenantId: string,
    input: SearchConfigInput,
  ): Promise<SearchConfig> {
    const data = {
      synonyms: input.synonyms as object,
      boosts: input.boosts as object,
      facets: input.facets as object,
      suggestConfig: input.suggestConfig as object,
    };
    const row = await this.prisma.searchConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.mapSearchConfig(row);
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actor: entry.actor,
        action: entry.action,
        before: (entry.before ?? undefined) as object | undefined,
        after: (entry.after ?? undefined) as object | undefined,
      },
    });
  }

  // ---- mappers (Prisma row -> domain) ------------------------------------

  private mapTenant(r: Row): Tenant {
    return {
      id: r.id as string,
      name: r.name as string,
      prefix: r.prefix as string,
      status: r.status as string,
      createdAt: r.createdAt as Date,
    };
  }

  private mapApiKey(r: Row): ApiKey {
    return {
      id: r.id as string,
      tenantId: r.tenantId as string,
      keyPrefix: r.keyPrefix as string,
      keyHash: r.keyHash as string,
      scopes: r.scopes as string[],
      originAllowlist: r.originAllowlist as string[],
      rateLimit: r.rateLimit as number,
      active: r.active as boolean,
      createdAt: r.createdAt as Date,
    };
  }

  private mapSource(r: Row): Source {
    return {
      id: r.id as string,
      tenantId: r.tenantId as string,
      type: r.type as string,
      name: r.name as string,
      connectorConfig: (r.connectorConfig ?? {}) as JsonObject,
      schedule: (r.schedule as string | null) ?? null,
      enabled: r.enabled as boolean,
    };
  }

  private mapTab(r: Row): TabConfig {
    return {
      id: r.id as string,
      tenantId: r.tenantId as string,
      tabKey: r.tabKey as string,
      label: r.label as string,
      sourceFilter: (r.sourceFilter ?? {}) as JsonObject,
      position: r.position as number,
      enabled: r.enabled as boolean,
    };
  }

  private mapSearchConfig(r: Row): SearchConfig {
    return {
      tenantId: r.tenantId as string,
      synonyms: (r.synonyms ?? []) as JsonArray,
      boosts: (r.boosts ?? {}) as JsonObject,
      facets: (r.facets ?? []) as JsonArray,
      suggestConfig: (r.suggestConfig ?? {}) as JsonObject,
    };
  }
}
