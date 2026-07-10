# I3 - Valkey

> Cache, rate-limit store, message broker, and pub/sub bus. Phase 1.

## 1. Role

- **Cache**: tenant/key/config lookups and hot query/suggest results.
- **Rate limiting**: per-key counters for the API Gateway throttler.
- **Broker/result backend**: Celery task queue for ingestion.
- **Pub/sub**: config-change invalidation events.

## 2. Version and licensing

- **Valkey 8.x** - the Linux Foundation, **BSD-3-Clause** fork of Redis (created when Redis moved to a source-available license). Fully open-source, $0.
- **Drop-in for Redis OSS 7.2+**: identical RESP protocol, commands, and clients. Every `redis://` URL and Redis client (ioredis, node-redis, redis-py, Celery's Redis transport) works unchanged - no code changes.

## 3. Logical separation

- Separate logical DBs (or separate instances in production) for: `cache`, `broker`, `results`, `ratelimit`. This isolates workloads so a broker backlog cannot evict cache entries.

## 4. Configuration and deployment

- MVP: single instance (Compose) with an append-only file (AOF) for broker durability.
- Production: Valkey Sentinel/Cluster; separate instances for cache vs broker; `maxmemory` + `allkeys-lru` for the cache instance, `noeviction` for the broker.

Consumers: `REDIS_URL` (cache), `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`. (URLs keep the `redis://` scheme for client compatibility.)

## 5. Scaling and performance

- Cache scales vertically easily; shard/cluster for very high throughput.
- Broker throughput can move to RabbitMQ (MPL-2.0, open-source) if Celery-on-Valkey limits are hit.

## 6. Resilience

- Cache is rebuildable (cold cache degrades latency, not correctness).
- Broker uses AOF; consider RabbitMQ for stronger delivery guarantees at scale.
- Rate-limit counters are ephemeral by design.

## 7. Security

- AUTH password/ACLs; TLS in production; private network only; separate credentials per workload where possible.

## 8. Observability

- `redis_exporter` (MIT, Valkey-compatible): memory, evictions, hit ratio, keyspace, blocked clients, broker list lengths (queue depth).

## 9. Local development

- Compose Valkey (`valkey/valkey` image); a single instance with multiple logical DBs is fine for dev.

## 10. Implementation steps (Phase 1)

1. Add Valkey to Compose with AOF and logical DB conventions.
2. Wire the gateway throttler, config cache, and Celery broker/result backend.
3. Implement the config invalidation pub/sub channel.
4. Add `redis_exporter` for metrics.

## 11. Open questions / future work

- Split cache vs broker instances in production.
- Move the broker to RabbitMQ for exactly-once semantics and higher throughput.
- Valkey Streams for a durable analytics event buffer.
