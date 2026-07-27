from fastapi.testclient import TestClient

from app.backends import FakeReranker
from app.config import Settings
from app.main import create_app
from app.schemas import Candidate, RerankRequest
from app.service import RerankService


def _settings(**over: object) -> Settings:
    # model_construct avoids env overrides from conftest / shell.
    base = dict(
        port=8094,
        log_level="info",
        use_fake=True,
        backend="local",
        reranker_model="fake",
        device="cpu",
        max_candidates=50,
        latency_budget_ms=5000,
        external_rerank_url="",
        external_rerank_api_key="",
        external_timeout_ms=2000,
    )
    base.update(over)
    return Settings.model_construct(**base)


def test_fake_orders_by_lexical_overlap():
    svc = RerankService(FakeReranker(), _settings())
    res = svc.rerank(
        RerankRequest(
            query="revenue report",
            candidates=[
                Candidate(id="a", text="employee handbook vacation policy"),
                Candidate(id="b", text="Q3 revenue report for the board"),
                Candidate(id="c", text="report of revenue growth in APAC"),
            ],
            top_k=3,
        )
    )
    assert not res.skipped
    ids = [r.id for r in res.results]
    assert ids[0] in ("b", "c")
    assert ids[-1] == "a"
    assert res.results[0].score >= res.results[-1].score


def test_truncates_to_max_candidates():
    svc = RerankService(FakeReranker(), _settings(max_candidates=2))
    res = svc.rerank(
        RerankRequest(
            query="india",
            candidates=[
                Candidate(id="1", text="india office"),
                Candidate(id="2", text="india handbook"),
                Candidate(id="3", text="india roadmap"),
            ],
            top_k=10,
        )
    )
    assert len(res.results) == 2


def test_budget_skip_when_elapsed_already_over(monkeypatch):
    svc = RerankService(FakeReranker(), _settings(latency_budget_ms=0))

    # Force "elapsed" past budget before scoring by patching perf_counter.
    # First call (t0) then second call (elapsed check) must show delta >= budget.
    times = iter([100.0, 100.1])  # 100ms elapsed with 0ms budget
    monkeypatch.setattr("app.service.time.perf_counter", lambda: next(times))

    res = svc.rerank(
        RerankRequest(
            query="x",
            candidates=[Candidate(id="1", text="x")],
            top_k=1,
        )
    )
    assert res.skipped is True
    assert res.results == []
    assert res.reason == "latency_budget"


def test_http_rerank_endpoint():
    app = create_app()
    client = TestClient(app)
    assert client.get("/healthz").json()["status"] == "ok"
    res = client.post(
        "/rerank",
        json={
            "query": "security platform",
            "candidates": [
                {"id": "1", "text": "Acme launches new security platform"},
                {"id": "2", "text": "Cafeteria menu for Friday"},
            ],
            "top_k": 2,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["skipped"] is False
    assert body["results"][0]["id"] == "1"
