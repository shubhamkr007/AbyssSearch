from __future__ import annotations

import hashlib
import math
from collections.abc import Sequence

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


class FakeEmbedder:
    """Deterministic, dependency-free embedder (no torch) for tests."""

    def __init__(self, dim: int = 8) -> None:
        self._dim = dim

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: Sequence[str], normalize: bool) -> list[list[float]]:
        out: list[list[float]] = []
        for text in texts:
            digest = hashlib.sha256(text.encode("utf-8")).digest()
            vec = [digest[i % len(digest)] / 255.0 for i in range(self._dim)]
            if normalize:
                norm = math.sqrt(sum(v * v for v in vec)) or 1.0
                vec = [v / norm for v in vec]
            out.append(vec)
        return out


class FakeNerAnalyzer:
    """Deterministic, dependency-free NER analyzer (no spaCy) for tests."""

    _DICTIONARY = {"ACME Corp": "ORG", "Berlin": "GPE", "2026": "DATE"}

    def __init__(self, model_name: str = "fake-ner") -> None:
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def labels(self) -> list[str]:
        return ["ORG", "GPE", "DATE", "PERSON"]

    def analyze(self, texts, types):
        allow = set(types) if types else None
        results = []
        for text in texts:
            entities = []
            for phrase, label in self._DICTIONARY.items():
                idx = text.find(phrase)
                if idx != -1 and (allow is None or label in allow):
                    entities.append(
                        {
                            "text": phrase,
                            "label": label,
                            "start": idx,
                            "end": idx + len(phrase),
                            "score": 0.99,
                        }
                    )
            entities.sort(key=lambda entity: entity["start"])
            results.append(entities)
        return results


def make_settings(**overrides) -> Settings:
    defaults = dict(
        embedding_model="fake-model",
        embedding_dim=8,
        normalize=True,
        max_batch_size=4,
        max_concurrency=2,
        ner_max_batch_size=4,
        ner_max_concurrency=2,
        warm_up=False,
    )
    defaults.update(overrides)
    return Settings(**defaults)


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def fake_embedder() -> FakeEmbedder:
    return FakeEmbedder(dim=8)


@pytest.fixture
def fake_ner_analyzer() -> FakeNerAnalyzer:
    return FakeNerAnalyzer()


@pytest.fixture
def client(
    settings: Settings,
    fake_embedder: FakeEmbedder,
    fake_ner_analyzer: FakeNerAnalyzer,
):
    app = create_app(settings=settings, embedder=fake_embedder, ner_analyzer=fake_ner_analyzer)
    with TestClient(app) as test_client:
        yield test_client
