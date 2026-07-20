"""Query-embedding client (S8). Degrades to None so retrieval can fall back to BM25."""

from __future__ import annotations

from typing import Protocol

import httpx


class EmbedClient(Protocol):
    def embed_query(self, text: str) -> list[float] | None: ...


class HttpEmbedClient:
    def __init__(self, base_url: str, timeout_ms: int = 5000) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout_ms / 1000

    def embed_query(self, text: str) -> list[float] | None:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(
                    f"{self.base_url}/embed",
                    json={"texts": [text], "type": "query"},
                )
                if res.status_code != 200:
                    return None
                vectors = res.json().get("vectors") or []
                return vectors[0] if vectors else None
        except Exception:
            return None


class FakeEmbedClient:
    def __init__(self, dims: int = 8) -> None:
        self.dims = dims

    def embed_query(self, text: str) -> list[float] | None:
        return [0.05] * self.dims
