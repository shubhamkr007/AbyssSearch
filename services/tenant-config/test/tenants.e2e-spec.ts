import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { CACHE_PUBLISHER, NoopCachePublisher } from '../src/cache/cache.publisher';
import { AdminGuard } from '../src/common/admin.guard';
import { APP_ENV, loadEnv } from '../src/config/env';
import { InMemoryTenantRepository } from '../src/domain/in-memory.repository';
import { TENANT_REPOSITORY } from '../src/domain/repository';
import { HealthController } from '../src/health/health.controller';
import { TenantsController } from '../src/tenants/tenants.controller';
import { TenantsService } from '../src/tenants/tenants.service';

const ADMIN = 'test-admin-token';

describe('Tenant/Config API (e2e, in-memory)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TenantsController, HealthController],
      providers: [
        { provide: APP_ENV, useValue: { ...loadEnv(), adminToken: ADMIN, useInMemory: true } },
        { provide: TENANT_REPOSITORY, useClass: InMemoryTenantRepository },
        { provide: CACHE_PUBLISHER, useClass: NoopCachePublisher },
        TenantsService,
        AdminGuard,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (req: request.Test) => req.set('x-admin-token', ADMIN);

  it('liveness responds', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200, { status: 'ok' });
  });

  it('rejects tenant creation without admin credentials', async () => {
    await request(app.getHttpServer())
      .post('/tenants')
      .send({ name: 'ACME', prefix: 'acme' })
      .expect(401);
  });

  it('validates the tenant prefix', async () => {
    await auth(request(app.getHttpServer()).post('/tenants'))
      .send({ name: 'ACME', prefix: 'AB' })
      .expect(400);
  });

  it('runs the full onboarding + read flow', async () => {
    const server = app.getHttpServer();

    // create tenant
    const created = await auth(request(server).post('/tenants'))
      .send({ name: 'ACME', prefix: 'acme' })
      .expect(201);
    const tenantId = created.body.id as string;
    expect(created.body.prefix).toBe('acme');

    // issue key
    const issued = await auth(request(server).post(`/tenants/${tenantId}/keys`))
      .send({ scopes: ['search'] })
      .expect(201);
    const key = issued.body.key as string;
    expect(key.startsWith('pk_live_')).toBe(true);

    // verify key
    const verified = await request(server)
      .post('/keys/verify')
      .send({ key })
      .expect(200);
    expect(verified.body.tenantId).toBe(tenantId);
    expect(verified.body.scopes).toEqual(['search']);

    // bad key
    await request(server).post('/keys/verify').send({ key: 'pk_live_nope' }).expect(401);

    // configure tabs
    await auth(request(server).put(`/tenants/${tenantId}/tabs`))
      .send({ tabs: [{ tabKey: 'all', label: 'All' }, { tabKey: 'news', label: 'News', enabled: false }] })
      .expect(200);

    // register a source
    await auth(request(server).post(`/tenants/${tenantId}/sources`))
      .send({ type: 'document', name: 'Wiki' })
      .expect(201);

    // aggregated config reflects enabled tabs only
    const config = await request(server).get(`/tenants/${tenantId}/config`).expect(200);
    expect(config.body.tenant.id).toBe(tenantId);
    expect(config.body.tabs).toHaveLength(1);
    expect(config.body.searchConfig.tenantId).toBe(tenantId);

    const sources = await request(server).get(`/tenants/${tenantId}/sources`).expect(200);
    expect(sources.body).toHaveLength(1);
  });

  it('returns 404 for an unknown tenant', async () => {
    await request(app.getHttpServer()).get('/tenants/does-not-exist').expect(404);
  });
});
