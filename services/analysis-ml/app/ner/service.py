from __future__ import annotations

from collections.abc import Sequence

from starlette.concurrency import run_in_threadpool

from app.concurrency import ConcurrencyLimiter, OverloadedError
from app.config import Settings
from app.ner.analyzer import NerAnalyzer

__all__ = ["NerService", "OverloadedError"]


class NerService:
    """Applies the default/explicit label filter, enforces a concurrency limit,
    and runs the (CPU-bound) spaCy pipeline in a worker thread."""

    def __init__(self, analyzer: NerAnalyzer, settings: Settings) -> None:
        self._analyzer = analyzer
        self._settings = settings
        self._limiter = ConcurrencyLimiter(settings.ner_max_concurrency)

    @property
    def model_name(self) -> str:
        return self._analyzer.model_name

    @property
    def labels(self) -> list[str]:
        return self._analyzer.labels

    @property
    def use_transformer(self) -> bool:
        return self._settings.use_transformer

    @property
    def default_types(self) -> list[str] | None:
        return self._settings.entity_types_list

    @property
    def max_batch_size(self) -> int:
        return self._settings.ner_max_batch_size

    @property
    def inflight(self) -> int:
        return self._limiter.inflight

    async def analyze(
        self, texts: Sequence[str], types: Sequence[str] | None
    ) -> list[list[dict]]:
        effective = list(types) if types else self._settings.entity_types_list
        async with self._limiter.slot():
            return await run_in_threadpool(self._analyzer.analyze, texts, effective)

    async def canary(self) -> int:
        """Analyze a canary string; returns the number of processed documents."""
        results = await self.analyze(["Berlin"], None)
        return len(results)
