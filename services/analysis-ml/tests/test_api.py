from __future__ import annotations


def test_embed_returns_vectors(client):
    resp = client.post("/embed", json={"texts": ["quarterly revenue"], "type": "query"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["model"] == "fake-model"
    assert body["dim"] == 8
    assert body["normalized"] is True
    assert body["type"] == "query"
    assert len(body["vectors"]) == 1
    assert len(body["vectors"][0]) == 8


def test_embed_defaults_to_passage(client):
    resp = client.post("/embed", json={"texts": ["hello"]})
    assert resp.status_code == 200
    assert resp.json()["type"] == "passage"


def test_embed_rejects_empty_batch(client):
    resp = client.post("/embed", json={"texts": []})
    assert resp.status_code == 422


def test_embed_rejects_oversized_batch(client):
    # settings fixture sets max_batch_size=4
    resp = client.post("/embed", json={"texts": ["a", "b", "c", "d", "e"]})
    assert resp.status_code == 422


def test_model_endpoint(client):
    body = client.get("/model").json()
    assert body["model"] == "fake-model"
    assert body["dim"] == 8
    assert body["backend"] == "sentence-transformers"


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_readyz(client):
    resp = client.get("/readyz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_metrics_exposes_counters(client):
    client.post("/embed", json={"texts": ["x"]})
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "embed_requests_total" in resp.text


def test_request_id_echoed(client):
    resp = client.post(
        "/embed", json={"texts": ["x"]}, headers={"x-request-id": "test-123"}
    )
    assert resp.headers.get("x-request-id") == "test-123"
