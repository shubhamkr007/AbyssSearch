"""Client-side Reciprocal Rank Fusion (the free ES Basic tier lacks native RRF)."""

from __future__ import annotations


def fuse_rrf(legs: list[list[str]], rank_constant: int = 60) -> list[str]:
    """Fuse ranked id lists by rank position. Returns ids sorted by fused score."""
    scores: dict[str, float] = {}
    for leg in legs:
        for rank, doc_id in enumerate(leg):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (rank_constant + rank + 1)
    return [doc_id for doc_id, _ in sorted(scores.items(), key=lambda kv: kv[1], reverse=True)]
