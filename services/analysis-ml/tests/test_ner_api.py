from __future__ import annotations


def test_ner_extracts_entities(client):
    resp = client.post(
        "/ner", json={"texts": ["ACME Corp reported 2026 revenue in Berlin."]}
    )
    assert resp.status_code == 200
    docs = resp.json()["entities"]
    assert len(docs) == 1
    labels = {e["label"] for e in docs[0]}
    assert {"ORG", "DATE", "GPE"} <= labels
    first = docs[0][0]
    assert first["text"] == "ACME Corp"
    assert first["start"] == 0
    assert first["end"] == 9
    assert first["score"] == 0.99


def test_ner_type_filter(client):
    resp = client.post("/ner", json={"texts": ["ACME Corp in Berlin 2026"], "types": ["GPE"]})
    entities = resp.json()["entities"][0]
    assert entities
    assert all(e["label"] == "GPE" for e in entities)
    assert any(e["text"] == "Berlin" for e in entities)


def test_ner_batch_returns_per_document(client):
    resp = client.post("/ner", json={"texts": ["Berlin", "ACME Corp"]})
    docs = resp.json()["entities"]
    assert len(docs) == 2
    assert docs[0][0]["label"] == "GPE"
    assert docs[1][0]["label"] == "ORG"


def test_ner_rejects_empty_batch(client):
    assert client.post("/ner", json={"texts": []}).status_code == 422


def test_ner_rejects_oversized_batch(client):
    # settings fixture sets ner_max_batch_size=4
    resp = client.post("/ner", json={"texts": ["a", "b", "c", "d", "e"]})
    assert resp.status_code == 422


def test_ner_model_info(client):
    body = client.get("/ner/model").json()
    assert body["model"] == "fake-ner"
    assert "ORG" in body["labels"]
    assert body["use_transformer"] is False


def test_ner_metrics_exposed(client):
    client.post("/ner", json={"texts": ["Berlin"]})
    assert "ner_requests_total" in client.get("/metrics").text
