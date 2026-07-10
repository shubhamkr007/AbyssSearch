from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager


class OverloadedError(Exception):
    """Raised when a service is already at its concurrency limit."""


class ConcurrencyLimiter:
    """Bounds the number of concurrent in-flight computations. Acquiring a slot
    when full raises :class:`OverloadedError` immediately (so the caller can
    return HTTP 429 rather than queueing unboundedly)."""

    def __init__(self, max_concurrency: int) -> None:
        self._max = max(1, max_concurrency)
        self._inflight = 0
        self._lock = asyncio.Lock()

    @property
    def inflight(self) -> int:
        return self._inflight

    @property
    def max_concurrency(self) -> int:
        return self._max

    @asynccontextmanager
    async def slot(self) -> AsyncIterator[None]:
        async with self._lock:
            if self._inflight >= self._max:
                raise OverloadedError()
            self._inflight += 1
        try:
            yield
        finally:
            async with self._lock:
                self._inflight -= 1
