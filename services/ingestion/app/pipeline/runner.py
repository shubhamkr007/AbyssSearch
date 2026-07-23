"""End-to-end ingest pipeline: normalize -> chunk -> enrich -> index."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.clients.enrich import EmbedClient, NerClient
from app.clients.indexer import IndexBackend, resolve_alias
from app.pipeline.entities import group_entities
from app.pipeline.ids import document_id
from app.pipeline.normalize import chunk_text
from app.pipeline.suggest_terms import count_terms_from_titles
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


def upsert_suggest_terms(
    docs: list[dict[str, Any]],
    indexer: IndexBackend,
    *,
    tenant_id: str,
    tenant_prefix: str,
) -> int:
    """Extract title words and upsert them into `auto_complete-{prefix}`."""
    # Prefer the parent chunk (chunk_index == 0) so we don't double-count
    # "(part N)" titles; fall back to every title if chunks lack the field.
    titles: list[str | None] = []
    seen_parents: set[str] = set()
    for d in docs:
        parent = str(d.get("parent_id") or d.get("id") or "")
        chunk_idx = d.get("chunk_index")
        if parent and parent in seen_parents:
            continue
        if chunk_idx is not None and int(chunk_idx) != 0:
            continue
        if parent:
            seen_parents.add(parent)
        titles.append(d.get("title") if isinstance(d.get("title"), str) else None)
    counts = count_terms_from_titles(titles)
    if not counts:
        return 0
    return indexer.upsert_autocomplete_terms(tenant_prefix, tenant_id, dict(counts))


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
    # Best-effort: never fail the ingest because suggest terms couldn't write.
    suggest_terms = 0
    try:
        # Store tenant_id as the index PREFIX — the Search Service / gateway
        # always filter autocomplete (and content) by prefix, not the UUID id.
        suggest_terms = upsert_suggest_terms(
            enriched, indexer, tenant_id=tenant_prefix, tenant_prefix=tenant_prefix
        )
    except Exception:
        suggest_terms = 0
    return {
        "ok": ok,
        "failed": failed,
        "ids": ids,
        "index": index,
        "doc_count": len(enriched),
        "suggest_terms": suggest_terms,
    }
