import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SEARCH_BACKEND, type SearchBackend } from '../search/backend';

@Controller()
export class HealthController {
  constructor(@Inject(SEARCH_BACKEND) private readonly backend: SearchBackend) {}

  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  @Get('readyz')
  async ready(@Res({ passthrough: true }) res: Response) {
    const elasticsearch = await this.backend.ping().catch(() => false);
    res.status(elasticsearch ? 200 : 503);
    return {
      status: elasticsearch ? 'ok' : 'unavailable',
      checks: { elasticsearch },
    };
  }
}
