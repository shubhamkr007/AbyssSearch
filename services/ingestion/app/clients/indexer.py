"""Elasticsearch indexer + index template for tenant document indices."""

from __future__ import annotations

from typing import Any, Protocol

INDEX_TEMPLATE_NAME = "enterprise-search-documents"
INDEX_TEMPLATE_PATTERN = "*-document*"

DOCUMENT_MAPPINGS: dict[str, Any] = {
    "properties": {
        "tenant_id": {"type": "keyword"},
        "source": {"type": "keyword"},
        "title": {
            "type": "text",
            "fields": {"suggest": {"type": "search_as_you_type"}},
        },
        "body": {"type": "text", "copy_to": "content_all"},
        "content_all": {"type": "text"},
        "url": {"type": "keyword"},
        "tags": {"type": "keyword"},
        "metadata": {"type": "flattened"},
        "entities": {"type": "keyword"},
        "embedding": {
            "type": "dense_vector",
            "dims": 384,
            "index": True,
            "similarity": "cosine",
        },
        "created_at": {"type": "date"},
        "published_at": {"type": "date"},
        "source_name": {"type": "keyword"},
        "chunk_index": {"type": "integer"},
        "parent_id": {"type": "keyword"},
    }
}

DOCUMENT_SETTINGS: dict[str, Any] = {
    "analysis": {
        "analyzer": {
            "edge_ngram_analyzer": {
                "tokenizer": "edge_ngram_tokenizer",
                "filter": ["lowercase"],
            }
        },
        "tokenizer": {
            "edge_ngram_tokenizer": {
                "type": "edge_ngram",
                "min_gram": 2,
                "max_gram": 20,
                "token_chars": ["letter", "digit"],
            }
        },
    }
}


class IndexBackend(Protocol):
    def ensure_index(self, alias: str, dims: int = 384) -> None: ...
    def bulk_upsert(self, index: str, docs: list[dict[str, Any]]) -> tuple[int, int, list[str]]: ...
    def ping(self) -> bool: ...


class FakeIndexBackend:
    def __init__(self) -> None:
        self.docs: dict[str, dict[str, Any]] = {}  # id -> doc
        self.indices: set[str] = set()

    def ensure_index(self, alias: str, dims: int = 384) -> None:
        self.indices.add(alias)

    def bulk_upsert(self, index: str, docs: list[dict[str, Any]]) -> tuple[int, int, list[str]]:
        ids: list[str] = []
        for doc in docs:
            doc_id = str(doc.get("id") or doc.get("_id"))
            body = {k: v for k, v in doc.items() if k not in ("id", "_id")}
            # Strip embedding dim mismatch issues in fake - store as-is.
            self.docs[doc_id] = {"_index": index, **body}
            self.indices.add(index)
            ids.append(doc_id)
        return len(ids), 0, ids

    def ping(self) -> bool:
        return True


class EsIndexBackend:
    def __init__(self, url: str, api_key: str = "", timeout_ms: int = 5000) -> None:
        from elasticsearch import Elasticsearch

        kwargs: dict[str, Any] = {"hosts": [url], "request_timeout": timeout_ms / 1000}
        if api_key:
            kwargs["api_key"] = api_key
        self.client = Elasticsearch(**kwargs)

    def ensure_index(self, alias: str, dims: int = 384) -> None:
        mappings = {
            "properties": {
                **DOCUMENT_MAPPINGS["properties"],
                "embedding": {
                    "type": "dense_vector",
                    "dims": dims,
                    "index": True,
                    "similarity": "cosine",
                },
            }
        }
        physical = f"{alias}-v1"
        if not self.client.indices.exists(index=physical):
            self.client.indices.create(
                index=physical,
                settings=DOCUMENT_SETTINGS,
                mappings=mappings,
            )
        # Point read alias at the physical index (create if missing).
        try:
            self.client.indices.put_alias(index=physical, name=alias)
        except Exception:
            # Alias may already exist on another index; keep going for MVP.
            pass

        # Best-effort global template so future indices match.
        try:
            self.client.indices.put_index_template(
                name=INDEX_TEMPLATE_NAME,
                index_patterns=[INDEX_TEMPLATE_PATTERN],
                template={"settings": DOCUMENT_SETTINGS, "mappings": mappings},
            )
        except Exception:
            pass

    def bulk_upsert(self, index: str, docs: list[dict[str, Any]]) -> tuple[int, int, list[str]]:
        if not docs:
            return 0, 0, []
        actions: list[dict[str, Any]] = []
        ids: list[str] = []
        for doc in docs:
            doc_id = str(doc["id"])
            ids.append(doc_id)
            body = {k: v for k, v in doc.items() if k != "id"}
            # Drop null embeddings so ES doesn't reject the doc.
            if body.get("embedding") is None:
                body.pop("embedding", None)
            actions.append({"index": {"_index": index, "_id": doc_id}})
            actions.append(body)

        resp = self.client.bulk(operations=actions, refresh=True)
        failed = 0
        if resp.get("errors"):
            for item in resp.get("items", []):
                if "error" in item.get("index", {}):
                    failed += 1
        ok = len(ids) - failed
        return ok, failed, ids

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except Exception:
            return False


def resolve_alias(tenant_prefix: str, source: str) -> str:
    return f"{tenant_prefix}-{source}"
