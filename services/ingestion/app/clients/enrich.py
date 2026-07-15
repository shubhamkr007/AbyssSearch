"""Downstream HTTP clients for enrichment (S8/S9). Failures are non-fatal."""

from __future__ import annotations

from typing import Any, Protocol

import httpx


class EmbedClient(Protocol):
    def embed_passages(self, texts: list[str]) -> list[list[float]] | None: ...


class NerClient(Protocol):
    def extract(self, texts: list[str]) -> list[list[str]] | None: ...
    def extract_detailed(self, texts: list[str]) -> list[list[dict[str, Any]]] | None: ...


class HttpEmbedClient:
    def __init__(self, base_url: str, timeout_ms: int = 5000) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout_ms / 1000

    def embed_passages(self, texts: list[str]) -> list[list[float]] | None:
        if not texts:
            return []
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(
                    f"{self.base_url}/embed",
                    json={"texts": texts, "type": "passage"},
                )
                if res.status_code != 200:
                    return None
                data = res.json()
                return data.get("vectors")
        except Exception:
            return None


class HttpNerClient:
    def __init__(self, base_url: str, timeout_ms: int = 5000) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout_ms / 1000

    def extract(self, texts: list[str]) -> list[list[str]] | None:
        if not texts:
            return []
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(f"{self.base_url}/ner", json={"texts": texts})
                if res.status_code != 200:
                    return None
                data = res.json()
                entities = data.get("entities") or []
                # Flatten entity texts per document.
                out: list[list[str]] = []
                for doc_ents in entities:
                    labels = []
                    for e in doc_ents or []:
                        text = e.get("text") if isinstance(e, dict) else None
                        if text:
                            labels.append(text)
                    out.append(labels)
                return out
        except Exception:
            return None

    def extract_detailed(self, texts: list[str]) -> list[list[dict[str, Any]]] | None:
        """Per-document entity spans with labels: [{text, label, start, end}, ...]."""
        if not texts:
            return []
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(f"{self.base_url}/ner", json={"texts": texts})
                if res.status_code != 200:
                    return None
                data = res.json()
                entities = data.get("entities") or []
                out: list[list[dict[str, Any]]] = []
                for doc_ents in entities:
                    items: list[dict[str, Any]] = []
                    for e in doc_ents or []:
                        if not isinstance(e, dict):
                            continue
                        text = e.get("text")
                        label = e.get("label")
                        if text and label:
                            items.append(
                                {
                                    "text": text,
                                    "label": label,
                                    "start": e.get("start"),
                                    "end": e.get("end"),
                                }
                            )
                    out.append(items)
                return out
        except Exception:
            return None


class FakeEmbedClient:
    def __init__(self, dims: int = 8) -> None:
        self.dims = dims

    def embed_passages(self, texts: list[str]) -> list[list[float]] | None:
        return [[0.01 * (i + 1)] * self.dims for i, _ in enumerate(texts)]


class FakeNerClient:
    def extract(self, texts: list[str]) -> list[list[str]] | None:
        return [[t.split()[0]] if t.split() else [] for t in texts]

    def extract_detailed(self, texts: list[str]) -> list[list[dict[str, Any]]] | None:
        out: list[list[dict[str, Any]]] = []
        for t in texts:
            toks = t.split()
            if toks:
                word = toks[0].strip(".,;:!?")
                out.append([{"text": word, "label": "ORG", "start": 0, "end": len(word)}])
            else:
                out.append([])
        return out
