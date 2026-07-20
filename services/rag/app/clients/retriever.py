"""Tenant-scoped hybrid retriever (BM25 + kNN, client-side RRF) over Elasticsearch.

Reads the same `{prefix}-*` indices the ingestion pipeline writes, always with a
mandatory `tenant_id` filter for isolation. Returns full passage bodies so the LLM
can ground its answer (the Search Service only exposes 200-char snippets).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.rrf import fuse_rrf

SOURCE_FIELDS = ["title", "body", "content_all", "url", "source", "parent_id", "chunk_index"]


@dataclass
class Passage:
    id: str
    title: str | None
    body: str
    url: str | None
    source: str | None
    score: float


class Retriever(Protocol):
    def retrieve(
        self,
        *,
        query: str,
        tenant_id: str,
        prefix: str,
        vector: list[float] | None,
        top_k: int,
    ) -> list[Passage]: ...

    def ping(self) -> bool: ...


class EsRetriever:
    def __init__(
        self,
        url: str,
        api_key: str = "",
        timeout_ms: int = 5000,
        *,
        rank_window: int = 20,
        knn_k: int = 20,
        knn_num_candidates: int = 100,
        rrf_rank_constant: int = 60,
    ) -> None:
        from elasticsearch import Elasticsearch

        # Fail fast on the request path: if ES is down, degrade to no_results
        # quickly instead of burning the LLM timeout on connection retries.
        kwargs: dict[str, Any] = {
            "hosts": [url],
            "request_timeout": timeout_ms / 1000,
            "max_retries": 0,
            "retry_on_timeout": False,
        }
        if api_key:
            kwargs["api_key"] = api_key
        self.client = Elasticsearch(**kwargs)
        self.rank_window = rank_window
        self.knn_k = knn_k
        self.knn_num_candidates = knn_num_candidates
        self.rrf_rank_constant = rrf_rank_constant

    def retrieve(self, *, query, tenant_id, prefix, vector, top_k):
        index = f"{prefix}-*"
        tenant_filter = [{"term": {"tenant_id": tenant_id}}]
        by_id: dict[str, Passage] = {}
        legs: list[list[str]] = []

        bm25_ids = self._bm25(index, query, tenant_filter, by_id)
        if bm25_ids is not None:
            legs.append(bm25_ids)

        if vector:
            knn_ids = self._knn(index, vector, tenant_filter, by_id)
            if knn_ids is not None:
                legs.append(knn_ids)

        if not legs:
            return []

        fused = fuse_rrf(legs, self.rrf_rank_constant)
        out: list[Passage] = []
        for i, doc_id in enumerate(fused[:top_k]):
            passage = by_id.get(doc_id)
            if passage is not None:
                passage.score = 1.0 / (self.rrf_rank_constant + i + 1)
                out.append(passage)
        return out

    def _search(self, index: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.client.search(
            index=index,
            ignore_unavailable=True,
            allow_no_indices=True,
            **body,
        )

    def _collect(self, resp: dict[str, Any], by_id: dict[str, Passage]) -> list[str]:
        ids: list[str] = []
        for hit in resp.get("hits", {}).get("hits", []):
            doc_id = hit.get("_id")
            if not doc_id:
                continue
            ids.append(doc_id)
            if doc_id not in by_id:
                src = hit.get("_source", {}) or {}
                by_id[doc_id] = Passage(
                    id=doc_id,
                    title=src.get("title"),
                    body=src.get("body") or src.get("content_all") or "",
                    url=src.get("url"),
                    source=src.get("source"),
                    score=float(hit.get("_score") or 0.0),
                )
        return ids

    def _bm25(self, index, query, tenant_filter, by_id):
        try:
            resp = self._search(
                index,
                {
                    "query": {
                        "bool": {
                            "must": [
                                {"multi_match": {"query": query, "fields": ["title^2", "body"]}}
                            ],
                            "filter": tenant_filter,
                        }
                    },
                    "size": self.rank_window,
                    "source_includes": SOURCE_FIELDS,
                },
            )
            return self._collect(resp, by_id)
        except Exception:
            return None

    def _knn(self, index, vector, tenant_filter, by_id):
        try:
            resp = self._search(
                index,
                {
                    "knn": {
                        "field": "embedding",
                        "query_vector": vector,
                        "k": self.knn_k,
                        "num_candidates": self.knn_num_candidates,
                        "filter": tenant_filter,
                    },
                    "size": self.knn_k,
                    "source_includes": SOURCE_FIELDS,
                },
            )
            return self._collect(resp, by_id)
        except Exception:
            return None

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except Exception:
            return False


_DEFAULT_FAKE_DOCS: list[dict[str, Any]] = [
    {
        "id": "doc-onboard",
        "title": "Employee Onboarding Guide",
        "body": "New hires get accounts, benefits enrollment, and a first-week checklist. "
        "IT provisions a laptop and access on day one.",
        "url": "https://demo.example/onboarding",
        "source": "document",
    },
    {
        "id": "doc-expense",
        "title": "Expense Reimbursement Policy",
        "body": "Submit receipts within 30 days to get reimbursed for travel and business "
        "expenses. Manager approval is required for amounts over 500 USD.",
        "url": "https://demo.example/expense",
        "source": "document",
    },
    {
        "id": "doc-vpn",
        "title": "VPN and Remote Access Setup",
        "body": "Install the VPN client and sign in with SSO to reach internal systems from "
        "home. Contact IT support if authentication fails.",
        "url": "https://demo.example/vpn",
        "source": "document",
    },
]


class FakeRetriever:
    """Naive keyword retriever over in-memory docs for tests/offline demos."""

    def __init__(self, docs: list[dict[str, Any]] | None = None) -> None:
        self.docs = docs if docs is not None else _DEFAULT_FAKE_DOCS

    def retrieve(self, *, query, tenant_id, prefix, vector, top_k):
        terms = [t for t in query.lower().split() if t]
        scored: list[tuple[int, dict[str, Any]]] = []
        for doc in self.docs:
            text = f"{doc.get('title', '')} {doc.get('body', '')}".lower()
            score = sum(1 for t in terms if t in text)
            scored.append((score, doc))
        scored.sort(key=lambda s: s[0], reverse=True)
        out: list[Passage] = []
        for score, doc in scored[:top_k]:
            out.append(
                Passage(
                    id=str(doc["id"]),
                    title=doc.get("title"),
                    body=doc.get("body", ""),
                    url=doc.get("url"),
                    source=doc.get("source"),
                    score=float(score),
                )
            )
        return out

    def ping(self) -> bool:
        return True
