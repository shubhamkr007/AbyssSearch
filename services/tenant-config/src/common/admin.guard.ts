import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { APP_ENV, type AppEnv } from '../config/env';

/**
 * Phase 1 admin auth: a shared bearer/`x-admin-token` secret. This is a
 * deliberate placeholder - Phase 3 replaces it with JWT/OIDC + RBAC (see
 * docs/services/admin-api.md). Requests are rejected if ADMIN_TOKEN is unset,
 * so the admin surface is never accidentally left open.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers['authorization'];
    const bearer =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice('Bearer '.length)
        : undefined;
    const headerToken = req.headers['x-admin-token'];
    const token = bearer ?? (typeof headerToken === 'string' ? headerToken : undefined);

    if (!this.env.adminToken || !token || token !== this.env.adminToken) {
      throw new UnauthorizedException('valid admin credentials required');
    }
    return true;
  }
}

/** Best-effort actor extraction for the audit log. */
export function actorFrom(req: Request): string {
  const actor = req.headers['x-admin-actor'];
  return typeof actor === 'string' && actor.length > 0 ? actor : 'admin';
}
