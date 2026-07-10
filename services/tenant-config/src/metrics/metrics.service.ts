import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Registry } from 'prom-client';

/**
 * Uses a dedicated (non-global) registry so multiple app instances - e.g. one
 * per e2e test - never collide on metric registration.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly configReads = new Counter({
    name: 'config_reads_total',
    help: 'Config read requests served.',
    labelNames: ['endpoint'] as const,
    registers: [this.registry],
  });

  readonly keyVerify = new Counter({
    name: 'config_key_verify_total',
    help: 'API key verification attempts.',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly adminWrites = new Counter({
    name: 'config_admin_writes_total',
    help: 'Admin mutations applied.',
    labelNames: ['action'] as const,
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
