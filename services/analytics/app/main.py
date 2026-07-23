from contextlib import asynccontextmanager
import json

import structlog
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.api import router
from app.config import get_settings
from app.wiring import build_store

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
    log.info("analytics.started", use_fake=settings.use_fake, port=settings.port)
    try:
        yield
    finally:
        # Flush anything still buffered on shutdown.
        try:
            app.state.store.close()
        except Exception:
            pass


def create_app() -> FastAPI:
    app = FastAPI(
        title="Analytics Service",
        description="S13 search analytics: buffered event intake + tenant-scoped reports "
        "(top queries, zero-results, CTR, latency).",
        version="0.1.0",
        lifespan=lifespan,
    )
    settings = get_settings()
    app.state.settings = settings
    # Built eagerly so state is present with or without the lifespan startup
    # (e.g. TestClient used without a context manager).
    app.state.store = build_store(settings)
    app.include_router(router)

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["authorization", "content-type", "x-admin-token", "x-admin-actor"],
        max_age=600,
    )

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        es_ok = app.state.store.ping()
        body = {"status": "ok" if es_ok else "unavailable", "checks": {"elasticsearch": es_ok}}
        return Response(
            content=json.dumps(body),
            media_type="application/json",
            status_code=200 if es_ok else 503,
        )

    @app.get("/metrics")
    def metrics():
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    return app


app = create_app()
