"""Composition root: wire repo, enrich clients, indexer, orchestrator."""

from __future__ import annotations

from app.clients.enrich import FakeEmbedClient, FakeNerClient, HttpEmbedClient, HttpNerClient
from app.clients.indexer import EsIndexBackend, FakeIndexBackend
from app.config import Settings, get_settings
from app.db import SqlAlchemyJobRepository, create_db_engine
from app.orchestrator import Orchestrator
from app.repository import InMemoryJobRepository, JobRepository


def build_repository(settings: Settings | None = None) -> JobRepository:
    settings = settings or get_settings()
    if settings.use_fake:
        return InMemoryJobRepository()
    engine = create_db_engine(settings.database_url)
    return SqlAlchemyJobRepository(engine)


def build_orchestrator(settings: Settings | None = None) -> Orchestrator:
    settings = settings or get_settings()
    repo = build_repository(settings)

    if settings.use_fake:
        embed: object = FakeEmbedClient()
        ner: object = FakeNerClient()
        indexer: object = FakeIndexBackend()
    else:
        embed = HttpEmbedClient(settings.embedding_service_url, settings.downstream_timeout_ms)
        ner = HttpNerClient(settings.ner_service_url, settings.downstream_timeout_ms)
        indexer = EsIndexBackend(
            settings.elasticsearch_url,
            settings.elasticsearch_api_key,
            settings.downstream_timeout_ms,
        )

    enqueue_fn = None
    if not settings.use_inline and not settings.use_fake:
        from app.workers.celery_app import enqueue_pipeline_task

        enqueue_fn = enqueue_pipeline_task

    return Orchestrator(
        repo=repo,
        embed=embed,  # type: ignore[arg-type]
        ner=ner,  # type: ignore[arg-type]
        indexer=indexer,  # type: ignore[arg-type]
        settings=settings,
        enqueue_fn=enqueue_fn,
    )
