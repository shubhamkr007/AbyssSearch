"""End-to-end ingest pipeline: normalize -> chunk -> enrich -> index."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.clients.enrich import EmbedClient, NerClient
from app.clients.indexer import IndexBackend, resolve_alias
from app.pipeline.entities import group_entities
from app.pipeline.ids import document_id
from app.pipeline.normalize import chunk_text
from app.schemas import InlineDocument


def build_canonical_docs(
    *,
    tenant_id: str,
    tenant_prefix: str,
    documents: list[InlineDocument],
    chunk: bool,
    chunk_size: int,
    chunk_overlap: int,
) -> list[dict[str, Any]]:
    """Normalize inline docs into ES-ready records (optionally chunked)."""
    out: list[dict[str, Any]] = []
    now = datetime.now(UTC).isoformat()

    for doc in documents:
        source = doc.source or "document"
        parent_id = document_id(
            tenant_prefix, source, doc.natural_key, doc.title, doc.body
        )
        texts = (
            chunk_text(doc.body, chunk_size, chunk_overlap) if chunk else [doc.body]
        )
        if not texts:
            texts = [doc.body]

        for i, piece in enumerate(texts):
            chunk_id = parent_id if len(texts) == 1 else f"{parent_id}:{i}"
            out.append(
                {
                    "id": chunk_id,
                    "tenant_id": tenant_id if tenant_id else tenant_prefix,
                    "source": source,
                    "title": doc.title if i == 0 else f"{doc.title} (part {i + 1})",
                    "body": piece,
                    "url": doc.url,
                    "tags": list(doc.tags or []),
                    "metadata": dict(doc.metadata or {}),
                    "entities": [],
                    "entities_by_type": {},
                    "embedding": None,
                    "created_at": now,
                    "parent_id": parent_id,
                    "chunk_index": i,
                }
            )
    return out


def enrich_docs(
    docs: list[dict[str, Any]],
    embed: EmbedClient,
    ner: NerClient,
    *,
    do_enrich: bool,
) -> list[dict[str, Any]]:
    if not do_enrich or not docs:
        return docs

    bodies = [str(d.get("body") or "") for d in docs]
    vectors = embed.embed_passages(bodies)
    detailed = ner.extract_detailed(bodies)

    for i, doc in enumerate(docs):
        if vectors and i < len(vectors) and vectors[i]:
            doc["embedding"] = vectors[i]
        if detailed and i < len(detailed) and detailed[i]:
            flat, by_type = group_entities(detailed[i])
            doc["entities"] = flat
            doc["entities_by_type"] = by_type
    return docs


def index_docs(
    docs: list[dict[str, Any]],
    indexer: IndexBackend,
    tenant_prefix: str,
    *,
    ensure_index: bool,
) -> tuple[int, int, list[str], str]:
    if not docs:
        return 0, 0, [], ""

    # Group by source type so each lands in the right alias.
    by_source: dict[str, list[dict[str, Any]]] = {}
    for d in docs:
        src = str(d.get("source") or "document")
        by_source.setdefault(src, []).append(d)

    total_ok = 0
    total_failed = 0
    all_ids: list[str] = []
    last_index = ""

    for source, group in by_source.items():
        alias = resolve_alias(tenant_prefix, source)
        last_index = alias
        dims = 384
        sample = next((g.get("embedding") for g in group if g.get("embedding")), None)
        if isinstance(sample, list) and sample:
            dims = len(sample)
        if ensure_index:
            indexer.ensure_index(alias, dims=dims)
        ok, failed, ids = indexer.bulk_upsert(alias, group)
        total_ok += ok
        total_failed += failed
        all_ids.extend(ids)

    return total_ok, total_failed, all_ids, last_index


def run_pipeline(
    *,
    tenant_id: str,
    tenant_prefix: str,
    documents: list[InlineDocument],
    embed: EmbedClient,
    ner: NerClient,
    indexer: IndexBackend,
    chunk: bool = True,
    enrich: bool = True,
    ensure_index: bool = True,
    chunk_size: int = 800,
    chunk_overlap: int = 100,
) -> dict[str, Any]:
    canonical = build_canonical_docs(
        tenant_id=tenant_id,
        tenant_prefix=tenant_prefix,
        documents=documents,
        chunk=chunk,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    enriched = enrich_docs(canonical, embed, ner, do_enrich=enrich)
    ok, failed, ids, index = index_docs(
        enriched, indexer, tenant_prefix, ensure_index=ensure_index
    )
    return {
        "ok": ok,
        "failed": failed,
        "ids": ids,
        "index": index,
        "doc_count": len(enriched),
    }
