"""Scoring backends for the reranker.

Fake: deterministic lexical overlap (tests / offline).
Local: sentence-transformers CrossEncoder (BAAI/bge-reranker-*).
External: optional HTTP API stub (opt-in; not used in default stack).
"""

from __future__ import annotations

import re
from typing import Protocol

import httpx
import structlog

from app.config import Settings

log = structlog.get_logger()

_TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)


class RerankBackend(Protocol):
    def ready(self) -> bool: ...

    def score(self, query: str, texts: list[str]) -> list[float]: ...


class FakeReranker:
    """Lexical token overlap — stable, no model download."""

    def ready(self) -> bool:
        return True

    def score(self, query: str, texts: list[str]) -> list[float]:
        q_tokens = set(_TOKEN_RE.findall(query.lower()))
        if not q_tokens:
            return [0.0] * len(texts)
        out: list[float] = []
        for text in texts:
            t_tokens = set(_TOKEN_RE.findall((text or "").lower()))
            overlap = len(q_tokens & t_tokens)
            # Prefer denser overlap; tiny length bonus for stability.
            density = overlap / max(len(q_tokens), 1)
            out.append(float(overlap) + density)
        return out


class LocalCrossEncoder:
    """Self-hosted CrossEncoder via sentence-transformers."""

    def __init__(self, model_name: str, device: str = "cpu") -> None:
        self._model_name = model_name
        self._device = device
        self._model = None

    def _ensure(self) -> None:
        if self._model is not None:
            return
        from sentence_transformers import CrossEncoder

        log.info("reranker.loading_model", model=self._model_name, device=self._device)
        self._model = CrossEncoder(self._model_name, device=self._device)

    def ready(self) -> bool:
        try:
            self._ensure()
            return self._model is not None
        except Exception as exc:  # noqa: BLE001 — readiness must never crash
            log.warning("reranker.model_not_ready", error=str(exc))
            return False

    def score(self, query: str, texts: list[str]) -> list[float]:
        self._ensure()
        assert self._model is not None
        pairs = [(query, t or "") for t in texts]
        scores = self._model.predict(pairs, show_progress_bar=False)
        return [float(s) for s in scores]


class ExternalReranker:
    """Opt-in HTTP rerank API. Returns empty scores on any failure."""

    def __init__(self, url: str, api_key: str = "", timeout_ms: int = 2000) -> None:
        self._url = url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout_ms / 1000.0

    def ready(self) -> bool:
        return bool(self._url)

    def score(self, query: str, texts: list[str]) -> list[float]:
        if not self._url:
            raise RuntimeError("EXTERNAL_RERANK_URL is not configured")
        headers = {"content-type": "application/json"}
        if self._api_key:
            headers["authorization"] = f"Bearer {self._api_key}"
        payload = {
            "query": query,
            "documents": texts,
        }
        with httpx.Client(timeout=self._timeout) as client:
            res = client.post(self._url, json=payload, headers=headers)
            res.raise_for_status()
            data = res.json()
        # Accept either [{score}] aligned with input or {results:[{index,score}]}
        if isinstance(data, list):
            return [float(x.get("score", 0.0) if isinstance(x, dict) else x) for x in data]
        results = data.get("results") or data.get("data") or []
        scores = [0.0] * len(texts)
        for item in results:
            if not isinstance(item, dict):
                continue
            idx = item.get("index")
            if isinstance(idx, int) and 0 <= idx < len(scores):
                scores[idx] = float(item.get("score", 0.0))
        return scores


def build_backend(settings: Settings) -> RerankBackend:
    if settings.use_fake:
        return FakeReranker()
    backend = (settings.backend or "local").lower()
    if backend == "external":
        return ExternalReranker(
            settings.external_rerank_url,
            settings.external_rerank_api_key,
            settings.external_timeout_ms,
        )
    return LocalCrossEncoder(settings.reranker_model, settings.device)
