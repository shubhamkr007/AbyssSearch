"""S3 connector + sync + checkpoint unit tests."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.clients.config import FakeConfigClient
from app.clients.enrich import FakeEmbedClient, FakeNerClient
from app.clients.indexer import FakeIndexBackend
from app.config import Settings
from app.connectors.s3 import FakeS3Connector, extract_text, relative_key
from app.db import SqlAlchemyJobRepository, create_db_engine
from app.orchestrator import Orchestrator
from app.repository import InMemoryJobRepository
from app.schemas import IngestJobRequest, S3TestRequest
from app.sync import CheckpointCursor, fetch_documents, next_checkpoint, reconcile_deletes


def test_relative_key_and_extract_text():
    assert relative_key("demo/handbook/a.txt", "demo/handbook/") == "a.txt"
    assert extract_text("notes.md", b"# Hello") == "# Hello"
    assert extract_text("skip.bin", b"\x00\x01") is None


def test_fake_s3_list_and_fetch():
    now = datetime.now(UTC)
    connector = FakeS3Connector(
        {
            "demo/handbook/a.txt": b"alpha body",
            "demo/handbook/b.md": b"bravo body",
            "demo/handbook/ignore.bin": b"nope",
        },
        prefix="demo/handbook/",
        last_modified={
            "demo/handbook/a.txt": now - timedelta(days=2),
            "demo/handbook/b.md": now,
        },
    )
    listed = connector.list_objects()
    assert [o.natural_key for o in listed] == ["a.txt", "b.md"]

    fetch = fetch_documents(
        connector,
        source_id="src1",
        bucket="content",
        mode="full",
        checkpoint=CheckpointCursor(),
    )
    assert len(fetch.documents) == 2
    assert fetch.documents[0].source == "document"
    assert fetch.documents[0].metadata["source_id"] == "src1"
    assert fetch.documents[0].natural_key == "a.txt"


def test_incremental_skips_older_objects():
    older = datetime(2024, 1, 1, tzinfo=UTC)
    newer = datetime(2024, 6, 1, tzinfo=UTC)
    connector = FakeS3Connector(
        {
            "old.txt": b"old",
            "new.txt": b"new",
        },
        last_modified={"old.txt": older, "new.txt": newer},
    )
    fetch = fetch_documents(
        connector,
        source_id="src1",
        bucket="content",
        mode="incremental",
        checkpoint=CheckpointCursor(last_modified=older.isoformat()),
    )
    assert [d.natural_key for d in fetch.documents] == ["new.txt"]
    assert fetch.skipped == 1


def test_full_sync_deletion_reconcile():
    indexer = FakeIndexBackend()
    # Seed two docs as if previously synced.
    indexer.bulk_upsert(
        "acme-document",
        [
            {
                "id": "keep",
                "tenant_id": "acme",
                "metadata": {"source_id": "src1", "natural_key": "keep.txt"},
            },
            {
                "id": "gone",
                "tenant_id": "acme",
                "metadata": {"source_id": "src1", "natural_key": "gone.txt"},
            },
            {
                "id": "other",
                "tenant_id": "acme",
                "metadata": {"source_id": "other", "natural_key": "x.txt"},
            },
        ],
    )
    deleted = reconcile_deletes(
        indexer,
        tenant_prefix="acme",
        tenant_id="acme",
        source_id="src1",
        seen_keys=["keep.txt"],
    )
    assert deleted == 1
    assert "gone" not in indexer.docs
    assert "keep" in indexer.docs
    assert "other" in indexer.docs


def test_checkpoint_roundtrip_sqlalchemy():
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    repo = SqlAlchemyJobRepository(engine)
    assert repo.get_checkpoint("src1") is None
    cursor = CheckpointCursor(last_modified="2024-01-01T00:00:00+00:00", known_keys=["a.txt"])
    repo.save_checkpoint("src1", "acme", cursor.to_dict())
    row = repo.get_checkpoint("src1")
    assert row is not None
    loaded = CheckpointCursor.from_dict(row["cursor"])
    assert loaded.last_modified == cursor.last_modified
    assert loaded.known_keys == ["a.txt"]


def test_checkpoint_next_helpers():
    prev = CheckpointCursor(last_modified="2024-01-01T00:00:00+00:00", known_keys=["a.txt"])
    from app.sync import SyncFetchResult

    fetch = SyncFetchResult(
        documents=[],
        seen_keys=["a.txt", "b.txt"],
        max_last_modified="2024-02-01T00:00:00+00:00",
    )
    full = next_checkpoint("full", prev, fetch)
    assert full.known_keys == ["a.txt", "b.txt"]
    incr = next_checkpoint("incremental", prev, fetch)
    assert incr.known_keys == ["a.txt", "b.txt"]
    assert incr.last_modified == "2024-02-01T00:00:00+00:00"


def test_source_id_ingest_with_fake_config(monkeypatch):
    settings = Settings(use_fake=True, use_inline=True, admin_token="x")
    repo = InMemoryJobRepository()
    indexer = FakeIndexBackend()
    config = FakeConfigClient()
    config.put(
        "acme",
        {
            "id": "src-s3",
            "type": "s3",
            "enabled": True,
            "connectorConfig": {
                "bucket": "content",
                "prefix": "demo/",
                "endpoint": "http://127.0.0.1:9000",
            },
        },
    )
    orch = Orchestrator(
        repo=repo,
        embed=FakeEmbedClient(),
        ner=FakeNerClient(),
        indexer=indexer,
        settings=settings,
        config_client=config,
    )

    fake = FakeS3Connector(
        {"demo/hello.txt": b"hello from minio"},
        prefix="demo/",
        bucket="content",
    )
    monkeypatch.setattr("app.orchestrator.build_s3_connector", lambda *a, **k: fake)

    resp = orch.start_ingest(
        IngestJobRequest(tenantId="acme", tenantPrefix="acme", sourceId="src-s3", mode="full")
    )

    assert resp.status == "succeeded"
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.ok >= 1
    assert any(d.get("title") == "hello.txt" for d in indexer.docs.values())
    cp = repo.get_checkpoint("src-s3")
    assert cp is not None
    assert "hello.txt" in (cp["cursor"].get("known_keys") or [])


def test_s3_test_endpoint_lists_without_index(orch: Orchestrator, monkeypatch):
    fake = FakeS3Connector({"a.txt": b"x", "b.txt": b"y"})
    monkeypatch.setattr("app.orchestrator.build_s3_connector", lambda *a, **k: fake)
    res = orch.test_s3_connector(
        S3TestRequest(connectorConfig={"bucket": "content", "endpoint": "http://x"})
    )
    assert res.ok is True
    assert res.listed == 2
    assert len(res.sample_keys) == 2
