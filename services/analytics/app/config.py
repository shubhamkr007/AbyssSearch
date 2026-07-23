from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    port: int = 8093
    log_level: str = "info"

    # Server-to-server intake is gated by the shared admin token (the gateway
    # forwards it). Reports are read by the Admin Console with the same token.
    admin_token: str = "dev-admin-token"
    # Comma-separated browser origins allowed to call this API (Admin Console).
    cors_origins: str = "*"

    # Storage. Analytics indices are named `{analytics_index_prefix}-{tenant}`
    # (e.g. `analytics-demo`) so they never collide with the content indices the
    # search service reads via the `{tenant}-*` wildcard.
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_api_key: str = ""
    es_timeout_ms: int = 5000
    analytics_index_prefix: str = "analytics"

    # Buffering: events are appended to an in-memory buffer and flushed to ES in
    # bulk either when the buffer fills or the flush interval elapses. Intake is
    # best-effort and never blocks the caller (search must not wait on analytics).
    buffer_size: int = 200
    flush_interval_ms: int = 2000
    # Refresh the index on flush so freshly-written events show up in reports
    # immediately (fine at dev volume; disable for high throughput).
    refresh_on_flush: bool = True
    # Drop a fraction of high-volume events (impression/click) under load.
    # 1.0 keeps everything; `query` events are never sampled out.
    sampling_rate: float = 1.0
    # Informational only for now (ILM/rollover is future work). Reports default
    # to this look-back window when the caller doesn't pass `days`.
    retention_days: int = 90
    default_report_days: int = 7

    # USE_FAKE: in-memory store (no ES needed) for tests / offline dev.
    use_fake: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
