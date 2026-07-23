from __future__ import annotations

from app.config import Settings
from app.store import AnalyticsStore, EsAnalyticsStore, InMemoryAnalyticsStore


def build_store(settings: Settings) -> AnalyticsStore:
    if settings.use_fake:
        return InMemoryAnalyticsStore(sampling_rate=settings.sampling_rate)
    return EsAnalyticsStore(
        settings.elasticsearch_url,
        settings.elasticsearch_api_key,
        settings.es_timeout_ms,
        index_prefix=settings.analytics_index_prefix,
        buffer_size=settings.buffer_size,
        flush_interval_ms=settings.flush_interval_ms,
        refresh_on_flush=settings.refresh_on_flush,
        sampling_rate=settings.sampling_rate,
    )
