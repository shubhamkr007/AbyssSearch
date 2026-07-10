from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from app.config import Settings


@runtime_checkable
class NerAnalyzer(Protocol):
    """Named-entity analysis backend contract."""

    @property
    def model_name(self) -> str: ...

    @property
    def labels(self) -> list[str]: ...

    def analyze(
        self, texts: Sequence[str], types: Sequence[str] | None
    ) -> list[list[dict]]: ...


class SpacyNerAnalyzer:
    """spaCy backend. ``spacy`` is imported lazily so the service and unit tests
    do not require spaCy (or a downloaded model) to be installed."""

    def __init__(self, model_name: str, *, batch_size: int = 32) -> None:
        import spacy  # lazy, heavy import

        self._model_name = model_name
        self._batch_size = batch_size
        self._nlp = spacy.load(model_name)
        try:
            self._labels = sorted(self._nlp.get_pipe("ner").labels)
        except Exception:
            self._labels = []

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def labels(self) -> list[str]:
        return list(self._labels)

    def analyze(
        self, texts: Sequence[str], types: Sequence[str] | None
    ) -> list[list[dict]]:
        allow = set(types) if types else None
        results: list[list[dict]] = []
        for doc in self._nlp.pipe(list(texts), batch_size=self._batch_size):
            entities: list[dict] = []
            for ent in doc.ents:
                if allow is not None and ent.label_ not in allow:
                    continue
                entities.append(
                    {
                        "text": ent.text,
                        "label": ent.label_,
                        "start": ent.start_char,
                        "end": ent.end_char,
                        # Calibrated per-entity confidence needs a transformer/beam
                        # pipeline; the statistical pipelines do not expose one.
                        "score": None,
                    }
                )
            results.append(entities)
        return results


def build_ner_analyzer(settings: Settings) -> NerAnalyzer:
    return SpacyNerAnalyzer(settings.spacy_model, batch_size=settings.ner_max_batch_size)
