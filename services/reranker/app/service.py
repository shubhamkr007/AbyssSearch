from __future__ import annotations

import time

import structlog

from app.backends import RerankBackend
from app.config import Settings
from app.metrics import RERANK_CANDIDATES, RERANK_LATENCY, RERANK_REQUESTS, RERANK_SKIPPED
from app.schemas import RankedResult, RerankRequest, RerankResponse

log = structlog.get_logger()


class RerankService:
    def __init__(self, backend: RerankBackend, settings: Settings) -> None:
        self.backend = backend
        self.settings = settings

    def ready(self) -> dict[str, bool]:
        return {"backend": self.backend.ready()}

    def rerank(self, req: RerankRequest) -> RerankResponse:
        t0 = time.perf_counter()
        if not req.candidates:
            RERANK_REQUESTS.labels(outcome="ok").inc()
            return RerankResponse(results=[], skipped=False)

        capped = req.candidates[: self.settings.max_candidates]
        # Soft budget: if we already spent the budget before scoring, skip.
        # (Model warm-up / GC can make first call slow; callers also have their own timeout.)
        elapsed_ms = (time.perf_counter() - t0) * 1000
        if elapsed_ms >= self.settings.latency_budget_ms:
            RERANK_SKIPPED.labels(reason="budget").inc()
            RERANK_REQUESTS.labels(outcome="skipped").inc()
            return RerankResponse(results=[], skipped=True, reason="latency_budget")

        try:
            scores = self.backend.score(req.query, [c.text for c in capped])
        except Exception as exc:  # noqa: BLE001
            log.warning("reranker.score_failed", error=str(exc))
            RERANK_REQUESTS.labels(outcome="error").inc()
            RERANK_SKIPPED.labels(reason="error").inc()
            return RerankResponse(results=[], skipped=True, reason="score_failed")

        elapsed_ms = (time.perf_counter() - t0) * 1000
        RERANK_LATENCY.observe(elapsed_ms / 1000)
        RERANK_CANDIDATES.inc(len(capped))

        if elapsed_ms > self.settings.latency_budget_ms:
            # Soft miss: still return scores if we have them (work already done),
            # but mark skipped=false since results are usable. Metric tracks overruns.
            RERANK_SKIPPED.labels(reason="budget_exceeded_after").inc()

        ranked = sorted(
            (
                RankedResult(id=c.id, score=float(scores[i] if i < len(scores) else 0.0))
                for i, c in enumerate(capped)
            ),
            key=lambda r: (-r.score, r.id),
        )
        top_k = min(req.top_k, len(ranked))
        RERANK_REQUESTS.labels(outcome="ok").inc()
        return RerankResponse(results=ranked[:top_k], skipped=False)
