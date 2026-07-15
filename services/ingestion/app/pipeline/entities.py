"""Group NER spans into a flat list + a typed {LABEL: [text, ...]} map."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any


def group_entities(
    detailed: Iterable[dict[str, Any]],
    types: Sequence[str] | None = None,
) -> tuple[list[str], dict[str, list[str]]]:
    """Return ``(flat_unique_texts, {LABEL: [unique_texts]})``.

    ``types`` (when provided) keeps only those entity labels, matched
    case-insensitively (e.g. ``["ORG", "PERSON", "GPE"]``).
    """
    allow = {t.strip().upper() for t in types if t and t.strip()} if types else None
    flat: list[str] = []
    seen: set[str] = set()
    by_type: dict[str, list[str]] = {}

    for span in detailed or []:
        text = str(span.get("text") or "").strip()
        label = str(span.get("label") or "").strip().upper()
        if not text or not label:
            continue
        if allow is not None and label not in allow:
            continue
        if text not in seen:
            seen.add(text)
            flat.append(text)
        bucket = by_type.setdefault(label, [])
        if text not in bucket:
            bucket.append(text)

    flat.sort()
    return flat, {label: sorted(vals) for label, vals in sorted(by_type.items())}
