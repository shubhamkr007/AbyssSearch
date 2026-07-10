from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables (or a .env file).

    Field names map to upper-case env vars, e.g. ``embedding_model`` <- ``EMBEDDING_MODEL``.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
        protected_namespaces=(),
    )

    app_name: str = "analysis-ml"
    port: int = 8000
    log_level: str = "INFO"

    # Model / embedding behaviour
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_dim: int = 384
    normalize: bool = True
    device: str = "cpu"
    backend: str = "sentence-transformers"
    model_cache_dir: str | None = None

    # Request shaping
    max_batch_size: int = 64
    max_concurrency: int = 4
    warm_up: bool = True

    # bge-small-en-v1.5 uses a retrieval instruction on the *query* side only;
    # passages are embedded verbatim. Both are configurable.
    query_instruction: str = "Represent this sentence for searching relevant passages: "
    passage_instruction: str = ""

    # --- NER (S9), co-hosted in this service ---
    # Default to the small model for a fast, low-resource install; en_core_web_lg
    # (higher accuracy) or en_core_web_trf (transformer) are drop-in via SPACY_MODEL.
    spacy_model: str = "en_core_web_sm"
    use_transformer: bool = False
    ner_max_batch_size: int = 32
    ner_max_concurrency: int = 4
    # Comma-separated default label filter, e.g. "ORG,GPE,DATE". Empty = return all labels.
    entity_types: str | None = None
    custom_ruler_url: str | None = None

    @property
    def entity_types_list(self) -> list[str] | None:
        if not self.entity_types:
            return None
        return [t.strip() for t in self.entity_types.split(",") if t.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
