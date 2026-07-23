"""Extract searchable words from document titles for the autocomplete index.

Produces lowercase terms that become edge-ngrammed in ES so typing `ind`
suggests `india` (word-by-word), not the full document title.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter

# Minimal English stopword list — keeps suggestions useful without an NLP dep.
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "but",
        "of",
        "to",
        "in",
        "on",
        "at",
        "for",
        "from",
        "by",
        "with",
        "as",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "it",
        "its",
        "this",
        "that",
        "these",
        "those",
        "part",  # chunked titles often end with "(part N)"
    }
)

_TOKEN_RE = re.compile(r"[a-z0-9]+(?:'[a-z]+)?", re.IGNORECASE)
_MIN_TERM_LEN = 2


def tokenize_title(title: str | None) -> list[str]:
    """Lowercase, strip punctuation, drop stopwords and short tokens."""
    if not title:
        return []
    # Drop chunk suffixes like " (part 2)" before tokenizing.
    cleaned = re.sub(r"\s*\(part\s+\d+\)\s*$", "", title, flags=re.IGNORECASE)
    out: list[str] = []
    seen: set[str] = set()
    for m in _TOKEN_RE.finditer(cleaned):
        tok = m.group(0).lower()
        if len(tok) < _MIN_TERM_LEN or tok in _STOPWORDS:
            continue
        if tok not in seen:
            seen.add(tok)
            out.append(tok)
    return out


def term_doc_id(tenant_id: str, term: str) -> str:
    """Stable ES `_id` so re-ingest upserts the same term document."""
    raw = f"{tenant_id}\0{term}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def count_terms_from_titles(titles: list[str | None]) -> Counter[str]:
    """Count unique-per-title term occurrences across a batch of titles."""
    counts: Counter[str] = Counter()
    for title in titles:
        for term in tokenize_title(title):
            counts[term] += 1
    return counts
