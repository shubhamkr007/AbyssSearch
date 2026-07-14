def test_healthz(client):
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_ingest_requires_admin(client):
    res = client.post("/jobs/ingest", json={"tenantId": "acme", "documents": []})
    assert res.status_code == 401


def test_ingest_and_get_job(client):
    payload = {
        "tenantId": "acme",
        "tenantPrefix": "acme",
        "documents": [
            {
                "title": "Q1 Revenue",
                "body": "ACME reported revenue.",
                "tags": ["finance"],
                "natural_key": "q1",
            }
        ],
        "options": {"chunk": False, "enrich": True},
    }
    res = client.post("/jobs/ingest", json=payload, headers={"x-admin-token": "test-admin"})
    assert res.status_code == 200
    body = res.json()
    assert body["jobId"]
    assert body["status"] == "succeeded"

    job = client.get(f"/jobs/{body['jobId']}", headers={"x-admin-token": "test-admin"})
    assert job.status_code == 200
    assert job.json()["counts"]["ok"] >= 1


def test_bulk_documents(client):
    payload = {
        "tenantId": "acme",
        "tenantPrefix": "acme",
        "documents": [{"title": "Doc", "body": "hello", "natural_key": "d1"}],
    }
    res = client.post("/documents:bulk", json=payload, headers={"x-admin-token": "test-admin"})
    assert res.status_code == 200
    assert res.json()["indexed"] == 1


def test_list_jobs(client):
    res = client.get("/jobs", headers={"x-admin-token": "test-admin"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)
