from app.config import Settings
from app.orchestrator import Orchestrator
from app.schemas import IngestJobRequest, InlineDocument
from app.wiring import build_orchestrator


def test_start_ingest_inline_succeeds(orch: Orchestrator):
    resp = orch.start_ingest(
        IngestJobRequest(
            tenantId="acme",
            tenantPrefix="acme",
            documents=[
                InlineDocument(title="Alpha", body="Body of alpha doc", tags=["a"]),
                InlineDocument(title="Bravo", body="Body of bravo doc", tags=["b"]),
            ],
            options={"chunk": False, "enrich": True},
        )
    )
    assert resp.status == "succeeded"
    assert resp.task_count == 1
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.ok == 2
    assert job.status == "succeeded"


def test_ingest_rejects_empty_documents(orch: Orchestrator):
    try:
        orch.start_ingest(IngestJobRequest(tenantId="acme", documents=[]))
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_bulk_upsert(orch: Orchestrator):
    from app.schemas import BulkDocumentsRequest

    result = orch.bulk_upsert(
        BulkDocumentsRequest(
            tenantId="acme",
            tenantPrefix="acme",
            documents=[InlineDocument(title="Bulk", body="hello world", natural_key="bulk-1")],
        )
    )
    assert result.indexed == 1
    assert result.index == "acme-document"


def test_sqlalchemy_repo_roundtrip():
    settings = Settings(
        use_fake=False,
        use_inline=True,
        database_url="sqlite+pysqlite:///:memory:",
        admin_token="x",
    )
    # Force SQLAlchemy path even though use_fake=False — swap clients to fakes manually.
    from app.clients.enrich import FakeEmbedClient, FakeNerClient
    from app.clients.indexer import FakeIndexBackend
    from app.db import SqlAlchemyJobRepository, create_db_engine

    repo = SqlAlchemyJobRepository(create_db_engine(settings.database_url))
    orch = Orchestrator(
        repo=repo,
        embed=FakeEmbedClient(),
        ner=FakeNerClient(),
        indexer=FakeIndexBackend(),
        settings=settings,
    )
    resp = orch.start_ingest(
        IngestJobRequest(
            tenantId="t1",
            documents=[InlineDocument(title="S", body="sqlalchemy path")],
        )
    )
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.status == "succeeded"
