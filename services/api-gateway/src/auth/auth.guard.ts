import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { CONFIG_CLIENT, type ConfigClient, ConfigUnavailableError } from '../clients/config.client';
import { APP_ENV, type AppEnv } from '../config/env';
import { MetricsService } from '../metrics/metrics.service';
import { type AuthedRequest, extractApiKey, originAllowed, originOf } from './request';
import { SCOPES_KEY } from './scopes.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(CONFIG_CLIENT) private readonly config: ConfigClient,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly reflector: Reflector,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const correlationId =
      (req.headers['x-request-id'] as string | undefined) ??
      (req as unknown as { id?: string }).id;

    const key = extractApiKey(req);
    if (!key) {
      this.metrics?.authFailures.inc({ reason: 'missing_key' });
      throw new UnauthorizedException('missing API key');
    }

    let ctx;
    try {
      ctx = await this.config.verifyKey(key, correlationId);
    } catch (err) {
      if (err instanceof ConfigUnavailableError) {
        this.metrics?.authFailures.inc({ reason: 'config_unavailable' });
        throw new ServiceUnavailableException('authentication backend unavailable');
      }
      throw err;
    }

    if (!ctx) {
      this.metrics?.authFailures.inc({ reason: 'invalid_key' });
      throw new UnauthorizedException('invalid or inactive API key');
    }

    if (ctx.originAllowlist.length > 0) {
      const origin = originOf(req);
      if (!origin || !originAllowed(origin, ctx.originAllowlist)) {
        this.metrics?.authFailures.inc({ reason: 'origin_denied' });
        throw new ForbiddenException('origin not allowed for this key');
      }
    }

    const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length && !required.every((s) => ctx!.scopes.includes(s))) {
      this.metrics?.authFailures.inc({ reason: 'insufficient_scope' });
      throw new ForbiddenException(`missing required scope(s): ${required.join(', ')}`);
    }

    req.tenantContext = ctx;
    req.correlationId = correlationId;
    return true;
  }
}
