"""Full / incremental sync orchestration for connectors."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.clients.indexer import IndexBackend, resolve_alias
from app.connectors.base import Connector
from app.connectors.s3 import extract_text
from app.schemas import InlineDocument

log = logging.getLogger(__name__)


@dataclass
class CheckpointCursor:
    last_modified: str | None = None
    known_keys: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "last_modified": self.last_modified,
            "known_keys": list(self.known_keys),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> CheckpointCursor:
        data = data or {}
        keys = data.get("known_keys") or []
        return cls(
            last_modified=data.get("last_modified"),
            known_keys=[str(k) for k in keys],
        )


@dataclass
class SyncFetchResult:
    documents: list[InlineDocument]
    seen_keys: list[str]
    max_last_modified: str | None
    skipped: int = 0


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def fetch_documents(
    connector: Connector,
    *,
    source_id: str,
    bucket: str,
    mode: str,
    checkpoint: CheckpointCursor,
) -> SyncFetchResult:
    """List + read objects into InlineDocuments (source=document)."""
    objects = connector.list_objects()
    cursor_dt = _parse_iso(checkpoint.last_modified) if mode == "incremental" else None

    docs: list[InlineDocument] = []
    seen: list[str] = []
    max_lm: datetime | None = None
    skipped = 0

    for obj in objects:
        seen.append(obj.natural_key)
        if obj.last_modified is not None:
            if max_lm is None or obj.last_modified > max_lm:
                max_lm = obj.last_modified
        if mode == "incremental" and cursor_dt is not None:
            if obj.last_modified is None or obj.last_modified <= cursor_dt:
                skipped += 1
                continue

        content = connector.read_object(obj)
        text = extract_text(content.key, content.body_bytes)
        if not text or not text.strip():
            skipped += 1
            log.warning("skip empty/unreadable object %s", content.key)
            continue

        title = obj.natural_key.rsplit("/", 1)[-1] or obj.natural_key
        docs.append(
            InlineDocument(
                title=title,
                body=text.strip(),
                url=None,
                tags=[],
                source="document",
                natural_key=obj.natural_key,
                metadata={
                    "object_key": obj.key,
                    "etag": content.etag,
                    "source_id": source_id,
                    "s3_bucket": bucket,
                    "natural_key": obj.natural_key,
                },
            )
        )

    return SyncFetchResult(
        documents=docs,
        seen_keys=seen,
        max_last_modified=_iso(max_lm) or checkpoint.last_modified,
        skipped=skipped,
    )


def reconcile_deletes(
    indexer: IndexBackend,
    *,
    tenant_prefix: str,
    tenant_id: str,
    source_id: str,
    seen_keys: list[str],
) -> int:
    """On full sync: delete ES docs for this source whose natural keys disappeared."""
    index = resolve_alias(tenant_prefix, "document")
    existing = indexer.find_by_source_id(index, tenant_id=tenant_id, source_id=source_id)
    seen = set(seen_keys)
    stale_ids = [
        doc_id
        for doc_id, meta in existing
        if str(meta.get("natural_key") or meta.get("object_key") or "") not in seen
    ]
    if not stale_ids:
        return 0
    return indexer.bulk_delete(index, stale_ids)


def next_checkpoint(
    mode: str,
    previous: CheckpointCursor,
    fetch: SyncFetchResult,
) -> CheckpointCursor:
    if mode == "full":
        return CheckpointCursor(
            last_modified=fetch.max_last_modified,
            known_keys=list(fetch.seen_keys),
        )
    known = list(dict.fromkeys([*previous.known_keys, *fetch.seen_keys]))
    return CheckpointCursor(
        last_modified=fetch.max_last_modified or previous.last_modified,
        known_keys=known,
    )
