from __future__ import annotations

import asyncio
import threading

import pytest

from app.ner.service import NerService, OverloadedError
from tests.conftest import FakeNerAnalyzer, make_settings


def build_service(**overrides) -> NerService:
    return NerService(FakeNerAnalyzer(), make_settings(**overrides))


def test_default_type_filter_applied():
    service = build_service(entity_types="GPE")
    [entities] = asyncio.run(service.analyze(["ACME Corp in Berlin"], None))
    assert entities
    assert all(e["label"] == "GPE" for e in entities)
    assert any(e["text"] == "Berlin" for e in entities)


def test_explicit_types_override_default():
    service = build_service(entity_types="GPE")
    [entities] = asyncio.run(service.analyze(["ACME Corp in Berlin"], ["ORG"]))
    assert all(e["label"] == "ORG" for e in entities)


def test_no_filter_returns_all_known_labels():
    service = build_service()
    [entities] = asyncio.run(service.analyze(["ACME Corp in Berlin 2026"], None))
    assert {e["label"] for e in entities} == {"ORG", "GPE", "DATE"}


def test_concurrency_limit_raises_overloaded():
    release = threading.Event()

    class BlockingAnalyzer(FakeNerAnalyzer):
        def analyze(self, texts, types):
            release.wait(timeout=2.0)
            return super().analyze(texts, types)

    service = NerService(BlockingAnalyzer(), make_settings(ner_max_concurrency=1))

    async def scenario():
        first = asyncio.create_task(service.analyze(["Berlin"], None))
        await asyncio.sleep(0.1)
        with pytest.raises(OverloadedError):
            await service.analyze(["Berlin"], None)
        release.set()
        await first

    asyncio.run(scenario())
