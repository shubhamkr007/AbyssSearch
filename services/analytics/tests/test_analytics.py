from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.schemas import EventIn
from app.store import EsAnalyticsStore, InMemoryAnalyticsStore


def make_events():
    return [
        EventIn(type="query", query="Security Policy", tab="all", result_count=3, latency_ms=40),
        EventIn(type="query", query="security policy", tab="all", result_count=5, latency_ms=60),
        EventIn(type="query", query="unknown thing", tab="all", result_count=0, latency_ms=20),
        EventIn(type="impression", query="security policy", tab="all"),
        EventIn(type="impression", query="security policy", tab="all"),
        EventIn(type="click", query="security policy", tab="all", doc_id="d1", rank=0),
    ]


def test_top_queries_groups_normalized_query():
    store = InMemoryAnalyticsStore()
    store.record("demo", make_events())
    rep = store.top_queries("demo", days=7, size=10)
    assert rep["total_queries"] == 3
    top = {i["query"]: i for i in rep["items"]}
    # "Security Policy" and "security policy" collapse into one bucket.
    assert top["security policy"]["count"] == 2
    assert top["security policy"]["avg_latency_ms"] == pytest.approx(50.0)
    assert top["unknown thing"]["zero_results"] == 1


def test_zero_results_rate():
    store = InMemoryAnalyticsStore()
    store.record("demo", make_events())
    rep = store.zero_results("demo", days=7, size=10)
    assert rep["total_zero_result_searches"] == 1
    assert rep["zero_result_rate"] == pytest.approx(1 / 3)
    assert rep["items"][0]["query"] == "unknown thing"


def test_ctr_report():
    store = InMemoryAnalyticsStore()
    store.record("demo", make_events())
    rep = store.ctr("demo", days=7, size=10)
    assert rep["impressions"] == 2
    assert rep["clicks"] == 1
    assert rep["ctr"] == pytest.approx(0.5)
    assert rep["items"][0]["query"] == "security policy"


def test_latency_percentiles():
    store = InMemoryAnalyticsStore()
    store.record("demo", make_events())
    rep = store.latency("demo", days=7)
    assert rep["count"] == 3
    assert rep["max_ms"] == 60
    assert rep["p50_ms"] == pytest.approx(40.0)


def test_tenant_isolation():
    store = InMemoryAnalyticsStore()
    store.record("demo", [EventIn(type="query", query="demo only", result_count=1, latency_ms=10)])
    store.record("acme", [EventIn(type="query", query="acme only", result_count=1, latency_ms=10)])
    demo = store.top_queries("demo", days=7, size=10)
    assert [i["query"] for i in demo["items"]] == ["demo only"]


# --- ES store: parse aggregation responses without a live cluster ------------


def _es_store() -> EsAnalyticsStore:
    """An EsAnalyticsStore with no real client/thread (we patch `_search`)."""
    store = EsAnalyticsStore.__new__(EsAnalyticsStore)
    store.index_prefix = "analytics"
    return store


def test_es_top_queries_parsing():
    store = _es_store()
    store._search = lambda prefix, body: {
        "hits": {"total": {"value": 5}},
        "aggregations": {
            "q": {
                "buckets": [
                    {"key": "security policy", "doc_count": 3, "zero": {"doc_count": 1}, "avg_latency": {"value": 50.0}},
                    {"key": "onboarding", "doc_count": 2, "zero": {"doc_count": 0}, "avg_latency": {"value": 20.0}},
                ]
            }
        },
    }
    rep = store.top_queries("demo", 7, 10)
    assert rep["total_queries"] == 5
    assert rep["items"][0] == {
        "query": "security policy",
        "count": 3,
        "zero_results": 1,
        "avg_latency_ms": 50.0,
    }


def test_es_zero_results_rate_parsing():
    store = _es_store()
    store._search = lambda prefix, body: {
        "hits": {"total": {"value": 2}},
        "aggregations": {"q": {"buckets": [{"key": "wat", "doc_count": 2}]}},
    }
    store._count = lambda prefix, days, extra: 8
    rep = store.zero_results("demo", 7, 10)
    assert rep["total_zero_result_searches"] == 2
    assert rep["zero_result_rate"] == pytest.approx(0.25)
    assert rep["items"][0] == {"query": "wat", "count": 2}


def test_es_ctr_parsing():
    store = _es_store()
    store._search = lambda prefix, body: {
        "aggregations": {
            "impressions": {"doc_count": 10},
            "clicks": {"doc_count": 4},
            "q": {
                "buckets": [
                    {"key": "a", "impressions": {"doc_count": 8}, "clicks": {"doc_count": 4}},
                    {"key": "b", "impressions": {"doc_count": 2}, "clicks": {"doc_count": 0}},
                ]
            },
        }
    }
    rep = store.ctr("demo", 7, 10)
    assert rep["impressions"] == 10 and rep["clicks"] == 4
    assert rep["ctr"] == pytest.approx(0.4)
    assert rep["items"][0] == {"query": "a", "impressions": 8, "clicks": 4, "ctr": pytest.approx(0.5)}


def test_es_latency_parsing():
    store = _es_store()
    store._search = lambda prefix, body: {
        "hits": {"total": {"value": 100}},
        "aggregations": {
            "pct": {"values": {"50.0": 30.0, "90.0": 80.0, "95.0": 95.0, "99.0": 120.0}},
            "avg": {"value": 42.5},
            "max": {"value": 200.0},
        },
    }
    rep = store.latency("demo", 7)
    assert rep["count"] == 100
    assert rep["p95_ms"] == 95.0
    assert rep["avg_ms"] == 42.5
    assert rep["max_ms"] == 200.0


@pytest.fixture()
def client():
    os.environ["USE_FAKE"] = "true"
    os.environ["ADMIN_TOKEN"] = "test-token"
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    with TestClient(app) as c:
        yield c


def test_events_requires_admin_token(client):
    res = client.post("/events", json={"tenant": "demo", "events": [{"type": "query", "query": "x"}]})
    assert res.status_code == 401


def test_events_and_reports_roundtrip(client):
    headers = {"authorization": "Bearer test-token"}
    payload = {
        "tenant": "demo",
        "events": [
            {"type": "query", "query": "hello world", "result_count": 2, "latency_ms": 30},
            {"type": "query", "query": "hello world", "result_count": 0, "latency_ms": 15},
            {"type": "impression", "query": "hello world"},
            {"type": "click", "query": "hello world", "doc_id": "d1", "rank": 0},
        ],
    }
    res = client.post("/events", json=payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["accepted"] == 4

    top = client.get("/reports/top-queries", params={"tenant": "demo"}, headers=headers).json()
    assert top["total_queries"] == 2
    assert top["items"][0]["query"] == "hello world"

    ctr = client.get("/reports/ctr", params={"tenant": "demo"}, headers=headers).json()
    assert ctr["clicks"] == 1 and ctr["impressions"] == 1
