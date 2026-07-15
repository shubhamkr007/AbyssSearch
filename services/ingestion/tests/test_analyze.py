from app.orchestrator import Orchestrator
from app.pipeline.entities import group_entities
from app.schemas import AnalyzeJobRequest, BulkDocumentsRequest, InlineDocument


def _ingest(orch: Orchestrator, **dockw) -> None:
    orch.bulk_upsert(
        BulkDocumentsRequest(
            tenantId="acme",
            tenantPrefix="acme",
            documents=[InlineDocument(**dockw)],
            options={"chunk": False, "enrich": False},
        )
    )


def test_group_entities_flat_and_typed():
    spans = [
        {"text": "ACME Corp", "label": "ORG"},
        {"text": "Berlin", "label": "GPE"},
        {"text": "ACME Corp", "label": "ORG"},  # duplicate
        {"text": "", "label": "ORG"},  # ignored
    ]
    flat, by_type = group_entities(spans)
    assert flat == ["ACME Corp", "Berlin"]
    assert by_type == {"GPE": ["Berlin"], "ORG": ["ACME Corp"]}


def test_group_entities_type_filter():
    spans = [
        {"text": "ACME Corp", "label": "ORG"},
        {"text": "Berlin", "label": "GPE"},
        {"text": "Sarah", "label": "PERSON"},
    ]
    flat, by_type = group_entities(spans, types=["org", "gpe"])
    assert set(flat) == {"ACME Corp", "Berlin"}
    assert "PERSON" not in by_type


def test_analyze_populates_typed_entities(orch: Orchestrator):
    _ingest(orch, title="Berlin Report", body="Berlin grew fast", natural_key="b1")

    resp = orch.start_analyze(
        AnalyzeJobRequest(tenantId="acme", tenantPrefix="acme", source="document")
    )
    assert resp.status == "succeeded"

    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.total == 1
    assert job.counts.ok == 1
    assert job.counts.skipped == 0

    stored = next(iter(orch.indexer.docs.values()))
    assert stored["entities"]  # flat list populated
    assert stored["entities_by_type"]  # typed map populated
    # FakeNerClient labels the first token as ORG.
    assert "ORG" in stored["entities_by_type"]


def test_analyze_by_doc_ids(orch: Orchestrator):
    _ingest(orch, title="One", body="Alpha company", natural_key="one")
    _ingest(orch, title="Two", body="Bravo company", natural_key="two")
    all_ids = list(orch.indexer.docs.keys())
    target_id = all_ids[0]

    resp = orch.start_analyze(
        AnalyzeJobRequest(
            tenantId="acme",
            tenantPrefix="acme",
            source="document",
            docIds=[target_id],
        )
    )
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.total == 1
    assert job.counts.ok == 1
    # Only the targeted doc got entities.
    assert orch.indexer.docs[target_id]["entities_by_type"]
    other_id = all_ids[1]
    assert orch.indexer.docs[other_id]["entities_by_type"] == {}


def test_analyze_skips_docs_without_content(orch: Orchestrator):
    orch.indexer.docs["empty-1"] = {
        "_index": "acme-document",
        "tenant_id": "acme",
        "body": "",
        "source": "document",
        "title": "Empty",
        "entities_by_type": {},
    }
    resp = orch.start_analyze(
        AnalyzeJobRequest(tenantId="acme", tenantPrefix="acme", source="document")
    )
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.total == 1
    assert job.counts.skipped == 1
    assert job.counts.ok == 0


def test_analyze_wildcard_scope(orch: Orchestrator):
    _ingest(orch, title="Doc", body="Gamma company", natural_key="g1")

    # No source => scan the whole tenant (acme-*).
    resp = orch.start_analyze(AnalyzeJobRequest(tenantId="acme", tenantPrefix="acme"))
    job = orch.get_job(resp.job_id)
    assert job is not None
    assert job.counts.ok == 1


def test_analyze_endpoint(client):
    admin = {"x-admin-token": "test-admin"}
    ingest_payload = {
        "tenantId": "acme",
        "tenantPrefix": "acme",
        "documents": [
            {"title": "Q1", "body": "ACME reported revenue", "natural_key": "q1"}
        ],
        "options": {"chunk": False, "enrich": False},
    }
    assert client.post("/jobs/ingest", json=ingest_payload, headers=admin).status_code == 200

    res = client.post(
        "/jobs/analyze",
        json={"tenantId": "acme", "tenantPrefix": "acme", "source": "document"},
        headers=admin,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "succeeded"

    job = client.get(f"/jobs/{body['jobId']}", headers=admin)
    assert job.status_code == 200
    counts = job.json()["counts"]
    assert counts["ok"] >= 1
    assert "skipped" in counts


def test_analyze_requires_admin(client):
    res = client.post("/jobs/analyze", json={"tenantId": "acme"})
    assert res.status_code == 401
