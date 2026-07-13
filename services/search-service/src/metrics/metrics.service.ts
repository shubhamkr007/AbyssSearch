import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly searchRequests = new Counter({
    name: 'search_requests_total',
    help: 'Search requests by hybrid mode and degraded flag.',
    labelNames: ['mode', 'degraded'] as const,
    registers: [this.registry],
  });

  readonly zeroResults = new Counter({
    name: 'search_zero_results_total',
    help: 'Searches that returned no results.',
    registers: [this.registry],
  });

  readonly suggestRequests = new Counter({
    name: 'suggest_requests_total',
    help: 'Suggest/autocomplete/did-you-mean requests.',
    labelNames: ['kind'] as const,
    registers: [this.registry],
  });

  readonly duration = new Histogram({
    name: 'search_duration_seconds',
    help: 'Latency split by phase (embed | es | total).',
    labelNames: ['phase'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
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
