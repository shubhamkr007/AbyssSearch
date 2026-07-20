"""Grounded-prompt assembly for RAG answers."""

from __future__ import annotations

from app.clients.retriever import Passage

SYSTEM = (
    "You are an enterprise search assistant. Answer the user's question using ONLY the "
    "numbered sources provided below. Cite the sources you rely on inline using square "
    "brackets, e.g. [1] or [2]. If the sources do not contain the answer, say you don't "
    "have enough information. Keep the answer concise (2-4 sentences) and factual."
)


def build_prompt(
    query: str,
    passages: list[Passage],
    per_passage_chars: int,
    max_context_chars: int,
) -> str:
    blocks: list[str] = []
    used = 0
    for i, passage in enumerate(passages, start=1):
        body = " ".join((passage.body or "").split())
        if len(body) > per_passage_chars:
            body = body[:per_passage_chars] + "\u2026"
        block = f"[{i}] {passage.title or 'Untitled'}\n{body}"
        if used + len(block) > max_context_chars and blocks:
            break
        blocks.append(block)
        used += len(block)
    context = "\n\n".join(blocks)
    return f"Question: {query}\n\nSources:\n{context}\n\nAnswer (cite sources as [n]):"
