from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol, runtime_checkable

from app.config import Settings


@runtime_checkable
class Embedder(Protocol):
    """Minimal embedding backend contract. Implementations must be thread-safe
    enough to run under ``run_in_threadpool``."""

    @property
    def dim(self) -> int: ...

    def embed(self, texts: Sequence[str], normalize: bool) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    """sentence-transformers backend.

    ``sentence_transformers`` (and torch) are imported lazily inside ``__init__``
    so the rest of the service - and the unit tests - do not require torch.
    """

    def __init__(
        self,
        model_name: str,
        *,
        device: str = "cpu",
        cache_dir: str | None = None,
        expected_dim: int | None = None,
        st_batch_size: int = 32,
    ) -> None:
        from sentence_transformers import SentenceTransformer  # lazy, heavy import

        self._model_name = model_name
        self._st_batch_size = st_batch_size
        self._model = SentenceTransformer(model_name, device=device, cache_folder=cache_dir)
        resolved = self._model.get_sentence_embedding_dimension()
        self._dim = int(resolved or expected_dim or 0)
        if expected_dim is not None and self._dim != expected_dim:
            raise ValueError(
                f"model {model_name!r} produced dim {self._dim}, expected {expected_dim}"
            )

    @property
    def dim(self) -> int:
        return self._dim

    def embed(self, texts: Sequence[str], normalize: bool) -> list[list[float]]:
        vectors = self._model.encode(
            list(texts),
            normalize_embeddings=normalize,
            convert_to_numpy=True,
            batch_size=self._st_batch_size,
        )
        return vectors.astype("float32").tolist()


def build_embedder(settings: Settings) -> Embedder:
    backend = settings.backend.lower()
    if backend in ("sentence-transformers", "st"):
        return SentenceTransformerEmbedder(
            settings.embedding_model,
            device=settings.device,
            cache_dir=settings.model_cache_dir,
            expected_dim=settings.embedding_dim,
        )
    # ONNX Runtime backend is a documented future option (see embedding-service.md).
    raise ValueError(f"unsupported embedding backend: {settings.backend!r}")
