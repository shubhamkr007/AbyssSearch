from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    port: int = 8094
    log_level: str = "info"

    # USE_FAKE: deterministic lexical scorer (no model download) for tests/offline.
    use_fake: bool = False
    # BACKEND: local (sentence-transformers CrossEncoder) | external (HTTP stub).
    backend: str = "local"

    reranker_model: str = "BAAI/bge-reranker-base"
    device: str = "cpu"
    max_candidates: int = 50
    latency_budget_ms: int = 300

    external_rerank_url: str = ""
    external_rerank_api_key: str = ""
    external_timeout_ms: int = 2000


@lru_cache
def get_settings() -> Settings:
    return Settings()
