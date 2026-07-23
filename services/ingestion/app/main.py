from contextlib import asynccontextmanager
import json

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api import router
from app.config import get_settings
from app.wiring import build_orchestrator

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
    settings = get_settings()
    app.state.settings = settings
    app.state.orchestrator = build_orchestrator(settings)
    log.info(
        "ingestion.started",
        use_fake=settings.use_fake,
        use_inline=settings.use_inline,
        port=settings.port,
    )
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title="Ingestion Orchestrator",
        description="S5 job control + S6 pipeline (inline or Celery).",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(router)

    # Admin Console (S11) posts ingest/analyze jobs from the browser.
    # Must allow x-admin-actor (admin client always sends it) or OPTIONS preflight → 400.
    origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type", "x-admin-actor", "x-admin-token"],
        max_age=600,
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        orch = app.state.orchestrator
        db_ok = orch.repo.ping()
        es_ok = orch.indexer.ping()
        ready = db_ok and es_ok
        body = {"status": "ok" if ready else "unavailable", "checks": {"db": db_ok, "indexer": es_ok}}
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
