from __future__ import annotations

import asyncio
import threading

import pytest

from app.embedding.service import EmbeddingService, OverloadedError
from app.schemas import TextType
from tests.conftest import FakeEmbedder, make_settings


def build_service(**overrides) -> EmbeddingService:
    return EmbeddingService(FakeEmbedder(8), make_settings(**overrides))


def test_query_and_passage_differ_due_to_instruction():
    service = build_service()
    query_vec = asyncio.run(service.embed(["revenue"], TextType.query))
    passage_vec = asyncio.run(service.embed(["revenue"], TextType.passage))
    assert query_vec != passage_vec  # the query instruction prefix changes the input


def test_vectors_are_normalized_to_unit_length():
    service = build_service()
    [vec] = asyncio.run(service.embed(["hello world"], TextType.passage))
    norm = sum(v * v for v in vec) ** 0.5
    assert abs(norm - 1.0) < 1e-6


def test_output_dim_matches_embedder():
    service = build_service()
    [vec] = asyncio.run(service.embed(["hello"], TextType.passage))
    assert len(vec) == service.dim == 8


def test_concurrency_limit_raises_overloaded():
    release = threading.Event()

    class BlockingEmbedder(FakeEmbedder):
        def embed(self, texts, normalize):
            release.wait(timeout=2.0)
            return super().embed(texts, normalize)

    service = EmbeddingService(BlockingEmbedder(8), make_settings(max_concurrency=1))

    async def scenario():
        first = asyncio.create_task(service.embed(["a"], TextType.passage))
        await asyncio.sleep(0.1)  # let the first request occupy the only slot
        with pytest.raises(OverloadedError):
            await service.embed(["b"], TextType.passage)
        release.set()
        await first

    asyncio.run(scenario())
