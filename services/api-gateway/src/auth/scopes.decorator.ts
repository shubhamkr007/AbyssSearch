import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

import type { TenantContext } from '../domain/types';
import type { AuthedRequest } from './request';

export const SCOPES_KEY = 'required_scopes';

/** Marks a route as requiring specific API-key scopes (checked in AuthGuard). */
export const RequireScopes = (...scopes: string[]) => SetMetadata(SCOPES_KEY, scopes);

/** Injects the resolved tenant context into a controller handler. */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.tenantContext as TenantContext;
  },
);

/** Injects the request correlation id. */
export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.correlationId;
  },
);
