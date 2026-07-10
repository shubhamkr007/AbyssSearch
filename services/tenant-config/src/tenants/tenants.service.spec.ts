import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { NoopCachePublisher } from '../cache/cache.publisher';
import { InMemoryTenantRepository } from '../domain/in-memory.repository';
import { TenantsService } from './tenants.service';

function build() {
  const repo = new InMemoryTenantRepository();
  const cache = new NoopCachePublisher();
  const service = new TenantsService(repo, cache);
  return { repo, cache, service };
}

describe('TenantsService', () => {
  it('creates and reads a tenant with an empty search-config', async () => {
    const { service } = build();
    const created = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    expect(created.prefix).toBe('acme');

    const fetched = await service.getTenant(created.id);
    expect(fetched.id).toBe(created.id);

    const cfg = await service.getSearchConfig(created.id);
    expect(cfg).toEqual({
      tenantId: created.id,
      synonyms: [],
      boosts: {},
      facets: [],
      suggestConfig: {},
    });
  });

  it('rejects a duplicate prefix', async () => {
    const { service } = build();
    await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await expect(
      service.createTenant({ name: 'Other', prefix: 'acme' }, 'tester'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound for an unknown tenant', async () => {
    const { service } = build();
    await expect(service.getTenant('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues a key and verifies it back to a tenant context', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    const issued = await service.issueKey(tenant.id, { scopes: ['search', 'suggest'] }, 'tester');

    expect(issued.key.startsWith('pk_live_')).toBe(true);

    const ctx = await service.verifyKey(issued.key);
    expect(ctx.tenantId).toBe(tenant.id);
    expect(ctx.prefix).toBe('acme');
    expect(ctx.scopes).toEqual(['search', 'suggest']);
  });

  it('rejects an invalid key', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await service.issueKey(tenant.id, {}, 'tester');
    await expect(service.verifyKey('pk_live_bogus')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stops verifying a revoked key', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    const issued = await service.issueKey(tenant.id, {}, 'tester');
    await service.revokeKey(tenant.id, issued.id, 'tester');
    await expect(service.verifyKey(issued.key)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('replaces tabs and filters disabled ones from aggregated config', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await service.setTabs(
      tenant.id,
      [
        { tabKey: 'all', label: 'All' },
        { tabKey: 'news', label: 'News', enabled: false, position: 1 },
      ],
      'tester',
    );
    const config = await service.getConfig(tenant.id);
    expect(config.tabs).toHaveLength(1);
    expect(config.tabs[0].tabKey).toBe('all');
  });

  it('merges partial search-config updates', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await service.upsertSearchConfig(tenant.id, { boosts: { title: 2 } }, 'tester');
    await service.upsertSearchConfig(tenant.id, { facets: ['type'] }, 'tester');
    const cfg = await service.getSearchConfig(tenant.id);
    expect(cfg.boosts).toEqual({ title: 2 });
    expect(cfg.facets).toEqual(['type']);
  });

  it('creates and lists sources', async () => {
    const { service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await service.createSource(
      tenant.id,
      { type: 'document', name: 'Wiki', connectorConfig: { root: '/docs' } },
      'tester',
    );
    const sources = await service.getSources(tenant.id);
    expect(sources).toHaveLength(1);
    expect(sources[0].type).toBe('document');
  });

  it('writes audit entries for mutations', async () => {
    const { repo, service } = build();
    const tenant = await service.createTenant({ name: 'ACME', prefix: 'acme' }, 'tester');
    await service.issueKey(tenant.id, {}, 'tester');
    const actions = repo.audit.map((a) => a.action);
    expect(actions).toContain('tenant.create');
    expect(actions).toContain('key.issue');
  });
});
