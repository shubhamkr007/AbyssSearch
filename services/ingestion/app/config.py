from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    port: int = 8090
    log_level: str = "info"
    admin_token: str = "dev-admin-token"

    database_url: str = "sqlite+pysqlite:///:memory:"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    config_service_url: str = "http://localhost:8000"
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_api_key: str = ""
    embedding_service_url: str = "http://localhost:8000"
    ner_service_url: str = "http://localhost:8000"

    max_bulk_batch: int = 100
    default_chunk_size: int = 800
    default_chunk_overlap: int = 100
    bulk_batch_size: int = 50
    max_retries: int = 3
    downstream_timeout_ms: int = 5000

    # USE_FAKE: in-memory repo + fake ES/embed/NER; INLINE: run pipeline in-process (no Celery).
    use_fake: bool = False
    use_inline: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
