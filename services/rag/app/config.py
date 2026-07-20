from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    port: int = 8092
    log_level: str = "info"

    # Retrieval (reads the same tenant indices the ingestion pipeline writes).
    elasticsearch_url: str = "http://localhost:9200"
    elasticsearch_api_key: str = ""
    embedding_service_url: str = "http://localhost:8000"

    # Generation (self-hosted, zero-cost). Ollama is optional: if it's not
    # reachable the service degrades to an extractive answer from the top source.
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"

    top_k: int = 5
    rank_window: int = 20
    knn_k: int = 20
    knn_num_candidates: int = 100
    rrf_rank_constant: int = 60
    per_passage_chars: int = 1200
    max_context_chars: int = 6000

    embed_timeout_ms: int = 5000
    es_timeout_ms: int = 5000
    llm_timeout_ms: int = 60000

    # USE_FAKE: fake retriever + fake LLM (no ES/Ollama needed) for tests/offline.
    use_fake: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
