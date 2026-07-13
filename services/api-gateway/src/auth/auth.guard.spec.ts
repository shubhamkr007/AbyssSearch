import 'reflect-metadata';

import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { FakeConfigClient } from '../clients/config.client';
import { loadEnv } from '../config/env';
import type { TenantContext } from '../domain/types';
import { AuthGuard } from './auth.guard';
import { SCOPES_KEY } from './scopes.decorator';

const CTX: TenantContext = {
  tenantId: 't1',
  prefix: 'acme',
  scopes: ['search'],
  originAllowlist: [],
  rateLimit: 60,
};

function makeGuard(config: FakeConfigClient) {
  return new AuthGuard(config, loadEnv(), new Reflector());
}

function execCtx(
  req: Record<string, unknown>,
  handler: (...args: unknown[]) => unknown = () => undefined,
) {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getHandler: () => handler,
    getClass: () => class {},
  } as never;
}

describe('AuthGuard', () => {
  it('accepts a valid key and attaches context', async () => {
    const config = new FakeConfigClient();
    config.keys.set('good', CTX);
    const req: Record<string, unknown> = { headers: { authorization: 'Bearer good' } };

    const ok = await makeGuard(config).canActivate(execCtx(req));
    expect(ok).toBe(true);
    expect(req.tenantContext).toEqual(CTX);
  });

  it('reads the key from x-api-key too', async () => {
    const config = new FakeConfigClient();
    config.keys.set('good', CTX);
    const req = { headers: { 'x-api-key': 'good' } };
    await expect(makeGuard(config).canActivate(execCtx(req))).resolves.toBe(true);
  });

  it('rejects a missing key with 401', async () => {
    await expect(makeGuard(new FakeConfigClient()).canActivate(execCtx({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid key with 401', async () => {
    const req = { headers: { authorization: 'Bearer nope' } };
    await expect(makeGuard(new FakeConfigClient()).canActivate(execCtx(req))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('maps config outage to 503', async () => {
    const config = new FakeConfigClient();
    config.unavailable = true;
    const req = { headers: { authorization: 'Bearer good' } };
    await expect(makeGuard(config).canActivate(execCtx(req))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('enforces the origin allowlist', async () => {
    const config = new FakeConfigClient();
    config.keys.set('good', { ...CTX, originAllowlist: ['https://app.acme.com'] });

    const denied = { headers: { authorization: 'Bearer good', origin: 'https://evil.com' } };
    await expect(makeGuard(config).canActivate(execCtx(denied))).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const allowed = { headers: { authorization: 'Bearer good', origin: 'https://app.acme.com' } };
    await expect(makeGuard(config).canActivate(execCtx(allowed))).resolves.toBe(true);
  });

  it('enforces required scopes', async () => {
    const config = new FakeConfigClient();
    config.keys.set('good', { ...CTX, scopes: ['read'] });
    const handler = () => undefined;
    Reflect.defineMetadata(SCOPES_KEY, ['search'], handler);
    const req = { headers: { authorization: 'Bearer good' } };
    await expect(makeGuard(config).canActivate(execCtx(req, handler))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
