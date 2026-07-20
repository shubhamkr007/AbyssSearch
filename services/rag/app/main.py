from contextlib import asynccontextmanager
import json

import structlog
from fastapi import FastAPI, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api import router
from app.config import get_settings
from app.wiring import build_service

structlog.configure(
    processors=[
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = app.state.settings
    log.info(
        "rag.started",
        use_fake=settings.use_fake,
        port=settings.port,
        model=settings.ollama_model,
    )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="RAG Service",
        description="S12 retrieval-augmented answers (tenant-scoped hybrid retrieve + self-hosted LLM).",
        version="0.1.0",
        lifespan=lifespan,
    )
    settings = get_settings()
    app.state.settings = settings
    # Built eagerly so state is present whether or not the lifespan startup runs
    # (e.g. TestClient without a context manager).
    app.state.service = build_service(settings)
    app.include_router(router)

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        checks = app.state.service.ready()
        # Retriever must be reachable; the LLM is optional (degrades to extractive).
        ready = bool(checks.get("retriever"))
        body = {"status": "ok" if ready else "unavailable", "checks": checks}
        return Response(
            content=json.dumps(body),
            media_type="application/json",
            status_code=200 if ready else 503,
        )

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
