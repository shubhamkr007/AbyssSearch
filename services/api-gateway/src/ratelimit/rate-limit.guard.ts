import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import type { Response } from 'express';

import { APP_ENV, type AppEnv } from '../config/env';
import type { AuthedRequest } from '../auth/request';
import { MetricsService } from '../metrics/metrics.service';
import { RATE_LIMITER, type RateLimiter } from './rate-limiter';

/** Enforces per-tenant rate limits. Must run after AuthGuard (needs context). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const ctx = req.tenantContext;
    if (!ctx) return true;

    const limit = ctx.rateLimit && ctx.rateLimit > 0 ? ctx.rateLimit : this.env.rateLimitDefault;
    const result = await this.limiter.hit(ctx.tenantId, limit);

    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      this.metrics?.rateLimited.inc({ tenant: ctx.tenantId });
      res.setHeader('Retry-After', String(Math.ceil(result.resetMs / 1000)));
      throw new HttpException('rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
