import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  // Liveness/readiness reflect the gateway process only; downstream health is
  // tracked by each service's own probes (the gateway degrades per-request).
  @Get('healthz')
  live() {
    return { status: 'ok' };
  }

  @Get('readyz')
  ready() {
    return { status: 'ok' };
  }
}
