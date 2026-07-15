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
        "entities_by_type": {"type": "flattened"},
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
    def search_documents(
        self,
        index: str,
        *,
        doc_ids: list[str] | None = None,
        tenant_id: str | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]: ...
    def update_document(self, index: str, doc_id: str, doc: dict[str, Any]) -> bool: ...
    def ensure_analysis_fields(self, index: str) -> None: ...
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

    def search_documents(
        self,
        index: str,
        *,
        doc_ids: list[str] | None = None,
        tenant_id: str | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        wanted = set(doc_ids) if doc_ids else None
        prefix = index[:-1] if index.endswith("*") else None
        out: list[dict[str, Any]] = []
        for doc_id, body in self.docs.items():
            idx = str(body.get("_index", ""))
            if prefix is not None:
                if not idx.startswith(prefix):
                    continue
            elif idx != index:
                continue
            if tenant_id and body.get("tenant_id") != tenant_id:
                continue
            if wanted is not None and doc_id not in wanted:
                continue
            out.append(
                {
                    "id": doc_id,
                    "index": idx,
                    "body": body.get("body") or body.get("content_all") or "",
                    "source": body.get("source"),
                    "title": body.get("title"),
                }
            )
            if len(out) >= limit:
                break
        return out

    def update_document(self, index: str, doc_id: str, doc: dict[str, Any]) -> bool:
        if doc_id in self.docs:
            self.docs[doc_id].update(doc)
            return True
        return False

    def ensure_analysis_fields(self, index: str) -> None:
        return None

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

        # Guarantee typed-entity fields exist even on pre-existing indices.
        self.ensure_analysis_fields(physical)

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

    def search_documents(
        self,
        index: str,
        *,
        doc_ids: list[str] | None = None,
        tenant_id: str | None = None,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        filters: list[dict[str, Any]] = []
        if tenant_id:
            filters.append({"term": {"tenant_id": tenant_id}})
        if doc_ids:
            query: dict[str, Any] = {
                "bool": {"filter": filters, "must": [{"ids": {"values": list(doc_ids)}}]}
            }
        elif filters:
            query = {"bool": {"filter": filters}}
        else:
            query = {"match_all": {}}
        try:
            resp = self.client.search(
                index=index,
                query=query,
                size=min(limit, 10000),
                source_includes=["body", "content_all", "source", "title", "tenant_id"],
                ignore_unavailable=True,
                allow_no_indices=True,
            )
        except Exception:
            return []
        out: list[dict[str, Any]] = []
        for hit in resp.get("hits", {}).get("hits", []):
            src = hit.get("_source", {}) or {}
            out.append(
                {
                    "id": hit.get("_id"),
                    "index": hit.get("_index"),
                    "body": src.get("body") or src.get("content_all") or "",
                    "source": src.get("source"),
                    "title": src.get("title"),
                }
            )
        return out

    def update_document(self, index: str, doc_id: str, doc: dict[str, Any]) -> bool:
        try:
            self.client.update(index=index, id=doc_id, doc=doc, refresh=True)
            return True
        except Exception:
            return False

    def ensure_analysis_fields(self, index: str) -> None:
        """Additively ensure entities/entities_by_type mappings exist (flattened)."""
        try:
            self.client.indices.put_mapping(
                index=index,
                properties={
                    "entities": {"type": "keyword"},
                    "entities_by_type": {"type": "flattened"},
                },
            )
        except Exception:
            pass

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except Exception:
            return False


def resolve_alias(tenant_prefix: str, source: str) -> str:
    return f"{tenant_prefix}-{source}"
