from __future__ import annotations

import os

os.environ["USE_FAKE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402

get_settings.cache_clear()
client = TestClient(create_app())


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}


def test_readyz_ok_with_fake_backends():
    res = client.get("/readyz")
    assert res.status_code == 200
    assert res.json()["checks"]["retriever"] is True


def test_answer_endpoint():
    res = client.post(
        "/answer",
        json={"query": "how do I get reimbursed", "tenant_id": "demo", "prefix": "demo"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["answer"]
    assert data["citations"][0]["title"] == "Expense Reimbursement Policy"
    assert data["used_context"] is True


def test_answer_requires_query():
    res = client.post("/answer", json={"tenant_id": "demo", "prefix": "demo"})
    assert res.status_code == 422
