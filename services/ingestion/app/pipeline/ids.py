"""Stable document ids derived from content hashes (idempotent upserts)."""

from __future__ import annotations

import hashlib


def content_hash(*parts: str) -> str:
    h = hashlib.sha1()
    for part in parts:
        h.update(part.encode("utf-8"))
        h.update(b"\0")
    return h.hexdigest()


def document_id(
    tenant_prefix: str,
    source: str,
    natural_key: str | None,
    title: str,
    body: str,
) -> str:
    """Idempotent ES `_id`: sha1(tenant + source + natural_key|title+body)."""
    key = natural_key if natural_key else f"{title}\n{body}"
    return content_hash(tenant_prefix, source, key)
