from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.embedding.embedder import Embedder, build_embedder
from app.embedding.router import router as embedding_router
from app.embedding.service import EmbeddingService
from app.logging import RequestIdMiddleware, configure_logging
from app.metrics import metrics_response
from app.ner.analyzer import NerAnalyzer, build_ner_analyzer
from app.ner.router import router as ner_router
from app.ner.service import NerService
from app.schemas import Health

log = structlog.get_logger(__name__)


def create_app(
    settings: Settings | None = None,
    embedder: Embedder | None = None,
    ner_analyzer: NerAnalyzer | None = None,
) -> FastAPI:
    """Application factory. Pass ``embedder`` / ``ner_analyzer`` to inject backends
    (used by tests) and skip loading the real models.

    The two capabilities load independently: if one model fails to load, the other
    still serves, and ``/readyz`` reports the failure.
    """
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.embedding_service = _init_embedding(settings, embedder)
        app.state.ner_service = _init_ner(settings, ner_analyzer)
        if settings.warm_up:
            await _warm_up(app)
        yield
        app.state.embedding_service = None
        app.state.ner_service = None

    app = FastAPI(title="analysis-ml (S8 Embedding + S9 NER)", version="0.1.0", lifespan=lifespan)
    app.add_middleware(RequestIdMiddleware)

    system = APIRouter(tags=["system"])

    @system.get("/healthz", response_model=Health)
    async def healthz() -> Health:
        return Health(status="ok")

    @system.get("/readyz")
    async def readyz() -> JSONResponse:
        checks: dict[str, object] = {}
        ready = True

        embedding = getattr(app.state, "embedding_service", None)
        if embedding is None:
            ready = False
            checks["embedding"] = "not_ready"
        else:
            try:
                checks["embedding"] = {"model": embedding.model_name, "dim": await embedding.canary()}
            except Exception as exc:
                ready = False
                checks["embedding"] = "error"
                log.error("embedding_canary_failed", error=str(exc))

        ner = getattr(app.state, "ner_service", None)
        if ner is None:
            ready = False
            checks["ner"] = "not_ready"
        else:
            try:
                await ner.canary()
                checks["ner"] = {"model": ner.model_name}
            except Exception as exc:
                ready = False
                checks["ner"] = "error"
                log.error("ner_canary_failed", error=str(exc))

        return JSONResponse(
            status_code=200 if ready else 503,
            content={"status": "ready" if ready else "not_ready", "checks": checks},
        )

    @system.get("/metrics")
    async def metrics():
        return metrics_response()

    app.include_router(system)
    app.include_router(embedding_router)
    app.include_router(ner_router)
    return app


def _init_embedding(settings: Settings, embedder: Embedder | None) -> EmbeddingService | None:
    active = embedder
    if active is None:
        try:
            active = build_embedder(settings)
        except Exception as exc:  # model download/load failure -> fail readiness
            log.error("embedder_load_failed", error=str(exc))
            return None
    return EmbeddingService(active, settings)


def _init_ner(settings: Settings, analyzer: NerAnalyzer | None) -> NerService | None:
    active = analyzer
    if active is None:
        try:
            active = build_ner_analyzer(settings)
        except Exception as exc:  # spaCy model missing -> fail readiness
            log.error("ner_load_failed", error=str(exc))
            return None
    return NerService(active, settings)


async def _warm_up(app: FastAPI) -> None:
    if app.state.embedding_service is not None:
        try:
            dim = await app.state.embedding_service.canary()
            log.info("embedding_ready", dim=dim)
        except Exception as exc:
            log.error("embedding_warm_up_failed", error=str(exc))
    if app.state.ner_service is not None:
        try:
            await app.state.ner_service.canary()
            log.info("ner_ready", model=app.state.ner_service.model_name)
        except Exception as exc:
            log.error("ner_warm_up_failed", error=str(exc))


app = create_app()
