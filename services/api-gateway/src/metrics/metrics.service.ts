import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequests = new Counter({
    name: 'gateway_requests_total',
    help: 'Public requests by route and status class.',
    labelNames: ['route', 'status'] as const,
    registers: [this.registry],
  });

  readonly requestDuration = new Histogram({
    name: 'gateway_request_duration_seconds',
    help: 'Request latency per route.',
    labelNames: ['route'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  readonly authFailures = new Counter({
    name: 'gateway_auth_failures_total',
    help: 'Authentication/authorization failures by reason.',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  readonly rateLimited = new Counter({
    name: 'gateway_rate_limited_total',
    help: 'Requests rejected by the rate limiter.',
    labelNames: ['tenant'] as const,
    registers: [this.registry],
  });

  readonly downstreamErrors = new Counter({
    name: 'gateway_downstream_errors_total',
    help: 'Downstream call failures by service.',
    labelNames: ['service'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }
}
