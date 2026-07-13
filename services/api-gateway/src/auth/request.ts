import type { Request } from 'express';

import type { TenantContext } from '../domain/types';

/** Express request enriched by the AuthGuard. */
export interface AuthedRequest extends Request {
  tenantContext?: TenantContext;
  correlationId?: string;
}

export function extractApiKey(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const header = req.headers['x-api-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return null;
}

export function originOf(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin) return origin;
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/** Allowlist entries may be full origins (`https://app.acme.com`) or bare hosts (`app.acme.com`). */
export function originAllowed(origin: string, allowlist: string[]): boolean {
  if (allowlist.includes(origin)) return true;
  try {
    const host = new URL(origin).host;
    return allowlist.includes(host);
  } catch {
    return false;
  }
}
