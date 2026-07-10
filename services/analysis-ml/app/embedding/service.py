from __future__ import annotations

from collections.abc import Sequence

from starlette.concurrency import run_in_threadpool

from app.concurrency import ConcurrencyLimiter, OverloadedError
from app.config import Settings
from app.embedding.embedder import Embedder
from app.schemas import TextType

__all__ = ["EmbeddingService", "OverloadedError"]


class EmbeddingService:
    """Applies the query/passage instruction, enforces a concurrency limit, and
    runs the (CPU-bound) embedder in a worker thread so the event loop stays free."""

    def __init__(self, embedder: Embedder, settings: Settings) -> None:
        self._embedder = embedder
        self._settings = settings
        self._limiter = ConcurrencyLimiter(settings.max_concurrency)

    @property
    def dim(self) -> int:
        return self._embedder.dim

    @property
    def model_name(self) -> str:
        return self._settings.embedding_model

    @property
    def normalized(self) -> bool:
        return self._settings.normalize

    @property
    def backend(self) -> str:
        return self._settings.backend

    @property
    def max_batch_size(self) -> int:
        return self._settings.max_batch_size

    @property
    def inflight(self) -> int:
        return self._limiter.inflight

    def _instruction(self, type_: TextType) -> str:
        if type_ == TextType.query:
            return self._settings.query_instruction
        return self._settings.passage_instruction

    def _prepare(self, texts: Sequence[str], type_: TextType) -> list[str]:
        prefix = self._instruction(type_)
        if prefix:
            return [f"{prefix}{text}" for text in texts]
        return list(texts)

    async def embed(self, texts: Sequence[str], type_: TextType) -> list[list[float]]:
        prepared = self._prepare(texts, type_)
        async with self._limiter.slot():
            return await run_in_threadpool(self._embedder.embed, prepared, self._settings.normalize)

    async def canary(self) -> int:
        """Embed a canary string; returns the produced dimensionality."""
        vectors = await self.embed(["canary"], TextType.query)
        return len(vectors[0])
