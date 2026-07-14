"""Plain-text chunker for RAG (fixed size + overlap)."""

from __future__ import annotations


def chunk_text(text: str, size: int = 800, overlap: int = 100) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if size <= 0:
        return [text]
    overlap = max(0, min(overlap, size - 1))
    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        # Prefer breaking on whitespace near the end.
        if end < n:
            window = text[start:end]
            cut = window.rfind(" ")
            if cut > size // 3:
                end = start + cut
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
