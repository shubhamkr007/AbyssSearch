"""Analytics storage: buffered event intake + tenant-scoped report aggregations.

Two implementations share one interface:

- `EsAnalyticsStore` buffers events in memory and bulk-writes them to per-tenant
  `{prefix}-analytics` -> actually `analytics-{prefix}` indices on a background
  thread. Reports are Elasticsearch aggregations. Intake is best-effort: it never
  raises and drops under pressure so the search path is never blocked.
- `InMemoryAnalyticsStore` keeps events in a list and computes the same reports in
  Python (used for tests / USE_FAKE offline dev).
"""

from __future__ import annotations

import random
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Protocol

from app.metrics import EVENTS_DROPPED, EVENTS_INGESTED, FLUSH_LATENCY
from app.schemas import EVENT_CLICK, EVENT_IMPRESSION, EVENT_QUERY, EventIn

# Fields we index. `query` is normalized (lowercased/trimmed) so term aggregations
# group case/spacing variants together; `query_raw` keeps the original for display.
ANALYTICS_MAPPINGS: dict[str, Any] = {
    "properties": {
        "tenant_id": {"type": "keyword"},
        "type": {"type": "keyword"},
        "query": {"type": "keyword", "ignore_above": 1024},
        "query_raw": {"type": "keyword", "ignore_above": 2048},
        "tab": {"type": "keyword"},
        "doc_id": {"type": "keyword"},
        "rank": {"type": "integer"},
        "result_count": {"type": "integer"},
        "latency_ms": {"type": "integer"},
        "zero_result": {"type": "boolean"},
        "session_id": {"type": "keyword"},
        "ts": {"type": "date"},
    }
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_query(query: str | None) -> str | None:
    if query is None:
        return None
    return " ".join(query.split()).lower()


def event_to_doc(prefix: str, e: EventIn) -> dict[str, Any]:
    """Normalize an inbound event into the stored ES document (drops None fields)."""
    zero = e.zero_result
    if zero is None and e.type == EVENT_QUERY and e.result_count is not None:
        zero = e.result_count == 0
    doc: dict[str, Any] = {
        "tenant_id": prefix,
        "type": e.type,
        "query": normalize_query(e.query),
        "query_raw": e.query,
        "tab": e.tab,
        "doc_id": e.doc_id,
        "rank": e.rank,
        "result_count": e.result_count,
        "latency_ms": e.latency_ms,
        "zero_result": zero,
        "session_id": e.session_id,
        "ts": e.ts or _now_iso(),
    }
    return {k: v for k, v in doc.items() if v is not None}


class AnalyticsStore(Protocol):
    def record(self, prefix: str, events: list[EventIn]) -> tuple[int, int]: ...
    def flush(self) -> None: ...
    def top_queries(self, prefix: str, days: int, size: int) -> dict[str, Any]: ...
    def zero_results(self, prefix: str, days: int, size: int) -> dict[str, Any]: ...
    def ctr(self, prefix: str, days: int, size: int) -> dict[str, Any]: ...
    def latency(self, prefix: str, days: int) -> dict[str, Any]: ...
    def ping(self) -> bool: ...
    def close(self) -> None: ...


# --------------------------------------------------------------------------- #
# In-memory (fake) store                                                       #
# --------------------------------------------------------------------------- #


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (pct / 100.0) * (len(ordered) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(ordered) - 1)
    frac = rank - lo
    return ordered[lo] + (ordered[hi] - ordered[lo]) * frac


class InMemoryAnalyticsStore:
    def __init__(self, sampling_rate: float = 1.0) -> None:
        self._docs: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self.sampling_rate = sampling_rate

    def record(self, prefix: str, events: list[EventIn]) -> tuple[int, int]:
        accepted = 0
        dropped = 0
        with self._lock:
            for e in events:
                if e.type != EVENT_QUERY and self.sampling_rate < 1.0:
                    if random.random() > self.sampling_rate:
                        dropped += 1
                        EVENTS_DROPPED.labels(reason="sampled").inc()
                        continue
                self._docs.append(event_to_doc(prefix, e))
                EVENTS_INGESTED.labels(type=e.type).inc()
                accepted += 1
        return accepted, dropped

    def flush(self) -> None:  # no-op: in-memory writes are synchronous
        return None

    def _window(self, prefix: str, days: int) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        out = []
        for d in self._docs:
            if d.get("tenant_id") != prefix:
                continue
            try:
                ts = datetime.fromisoformat(str(d.get("ts")))
            except ValueError:
                ts = datetime.now(timezone.utc)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= cutoff:
                out.append(d)
        return out

    def top_queries(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        docs = [d for d in self._window(prefix, days) if d.get("type") == EVENT_QUERY]
        groups: dict[str, list[dict[str, Any]]] = {}
        for d in docs:
            groups.setdefault(d.get("query", ""), []).append(d)
        items = []
        for q, rows in groups.items():
            latencies = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
            zeros = sum(1 for r in rows if r.get("zero_result"))
            items.append(
                {
                    "query": q,
                    "count": len(rows),
                    "zero_results": zeros,
                    "avg_latency_ms": (sum(latencies) / len(latencies)) if latencies else None,
                }
            )
        items.sort(key=lambda x: x["count"], reverse=True)
        return {"tenant": prefix, "days": days, "total_queries": len(docs), "items": items[:size]}

    def zero_results(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        queries = [d for d in self._window(prefix, days) if d.get("type") == EVENT_QUERY]
        zero = [d for d in queries if d.get("zero_result")]
        groups: dict[str, int] = {}
        for d in zero:
            groups[d.get("query", "")] = groups.get(d.get("query", ""), 0) + 1
        items = [{"query": q, "count": c} for q, c in groups.items()]
        items.sort(key=lambda x: x["count"], reverse=True)
        rate = (len(zero) / len(queries)) if queries else 0.0
        return {
            "tenant": prefix,
            "days": days,
            "total_zero_result_searches": len(zero),
            "zero_result_rate": rate,
            "items": items[:size],
        }

    def ctr(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        docs = self._window(prefix, days)
        imp = [d for d in docs if d.get("type") == EVENT_IMPRESSION]
        clk = [d for d in docs if d.get("type") == EVENT_CLICK]
        groups: dict[str, dict[str, int]] = {}
        for d in imp:
            groups.setdefault(d.get("query", ""), {"impressions": 0, "clicks": 0})["impressions"] += 1
        for d in clk:
            groups.setdefault(d.get("query", ""), {"impressions": 0, "clicks": 0})["clicks"] += 1
        items = []
        for q, c in groups.items():
            ctr = (c["clicks"] / c["impressions"]) if c["impressions"] else 0.0
            items.append({"query": q, "impressions": c["impressions"], "clicks": c["clicks"], "ctr": ctr})
        items.sort(key=lambda x: x["impressions"], reverse=True)
        total_imp = len(imp)
        total_clk = len(clk)
        return {
            "tenant": prefix,
            "days": days,
            "impressions": total_imp,
            "clicks": total_clk,
            "ctr": (total_clk / total_imp) if total_imp else 0.0,
            "items": items[:size],
        }

    def latency(self, prefix: str, days: int) -> dict[str, Any]:
        vals = [
            float(d["latency_ms"])
            for d in self._window(prefix, days)
            if d.get("type") == EVENT_QUERY and d.get("latency_ms") is not None
        ]
        return {
            "tenant": prefix,
            "days": days,
            "count": len(vals),
            "avg_ms": (sum(vals) / len(vals)) if vals else None,
            "p50_ms": _percentile(vals, 50),
            "p90_ms": _percentile(vals, 90),
            "p95_ms": _percentile(vals, 95),
            "p99_ms": _percentile(vals, 99),
            "max_ms": max(vals) if vals else None,
        }

    def ping(self) -> bool:
        return True

    def close(self) -> None:
        return None


# --------------------------------------------------------------------------- #
# Elasticsearch store                                                          #
# --------------------------------------------------------------------------- #


class EsAnalyticsStore:
    def __init__(
        self,
        url: str,
        api_key: str = "",
        timeout_ms: int = 5000,
        *,
        index_prefix: str = "analytics",
        buffer_size: int = 200,
        flush_interval_ms: int = 2000,
        refresh_on_flush: bool = True,
        sampling_rate: float = 1.0,
    ) -> None:
        from elasticsearch import Elasticsearch

        kwargs: dict[str, Any] = {
            "hosts": [url],
            "request_timeout": timeout_ms / 1000,
            "max_retries": 1,
            "retry_on_timeout": False,
        }
        if api_key:
            kwargs["api_key"] = api_key
        self.client = Elasticsearch(**kwargs)
        self.index_prefix = index_prefix
        self.buffer_size = max(1, buffer_size)
        self.flush_interval = max(0.1, flush_interval_ms / 1000)
        self.refresh_on_flush = refresh_on_flush
        self.sampling_rate = sampling_rate

        self._buffer: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        self._ensured: set[str] = set()
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = threading.Thread(
            target=self._flush_loop, name="analytics-flush", daemon=True
        )
        self._thread.start()

    def index_for(self, prefix: str) -> str:
        return f"{self.index_prefix}-{prefix}"

    # --- intake ---

    def record(self, prefix: str, events: list[EventIn]) -> tuple[int, int]:
        accepted = 0
        dropped = 0
        docs = []
        for e in events:
            if e.type != EVENT_QUERY and self.sampling_rate < 1.0:
                if random.random() > self.sampling_rate:
                    dropped += 1
                    EVENTS_DROPPED.labels(reason="sampled").inc()
                    continue
            docs.append(event_to_doc(prefix, e))
            EVENTS_INGESTED.labels(type=e.type).inc()
            accepted += 1
        if not docs:
            return accepted, dropped
        with self._lock:
            self._buffer.extend(docs)
            full = len(self._buffer) >= self.buffer_size
        if full:
            self._wake.set()
        return accepted, dropped

    def _flush_loop(self) -> None:
        while not self._stop.is_set():
            self._wake.wait(timeout=self.flush_interval)
            self._wake.clear()
            try:
                self.flush()
            except Exception:  # never let the background thread die
                EVENTS_DROPPED.labels(reason="flush_error").inc()

    def flush(self) -> None:
        with self._lock:
            if not self._buffer:
                return
            batch = self._buffer
            self._buffer = []
        started = time.perf_counter()
        try:
            self._bulk_write(batch)
        except Exception:
            # Best-effort: on a hard failure we drop this batch rather than block.
            EVENTS_DROPPED.labels(reason="bulk_failed").inc(len(batch))
            raise
        finally:
            FLUSH_LATENCY.observe(time.perf_counter() - started)

    def _bulk_write(self, batch: list[dict[str, Any]]) -> None:
        by_index: dict[str, list[dict[str, Any]]] = {}
        for doc in batch:
            by_index.setdefault(self.index_for(doc["tenant_id"]), []).append(doc)
        for index, docs in by_index.items():
            self._ensure_index(index)
            ops: list[dict[str, Any]] = []
            for doc in docs:
                ops.append({"index": {"_index": index}})
                ops.append(doc)
            self.client.bulk(operations=ops, refresh=self.refresh_on_flush)

    def _ensure_index(self, index: str) -> None:
        if index in self._ensured:
            return
        try:
            if not self.client.indices.exists(index=index):
                self.client.indices.create(index=index, mappings=ANALYTICS_MAPPINGS)
        except Exception:
            # Race or already-exists: assume usable and move on.
            pass
        self._ensured.add(index)

    # --- reports ---

    def _base_filter(self, prefix: str, days: int, extra: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "bool": {
                "filter": [
                    {"term": {"tenant_id": prefix}},
                    {"range": {"ts": {"gte": f"now-{days}d"}}},
                    *extra,
                ]
            }
        }

    def _search(self, prefix: str, body: dict[str, Any]) -> dict[str, Any]:
        return self.client.search(
            index=self.index_for(prefix),
            ignore_unavailable=True,
            allow_no_indices=True,
            **body,
        )

    def top_queries(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        resp = self._search(
            prefix,
            {
                "size": 0,
                "query": self._base_filter(prefix, days, [{"term": {"type": EVENT_QUERY}}]),
                "track_total_hits": True,
                "aggs": {
                    "q": {
                        "terms": {"field": "query", "size": size},
                        "aggs": {
                            "zero": {"filter": {"term": {"zero_result": True}}},
                            "avg_latency": {"avg": {"field": "latency_ms"}},
                        },
                    }
                },
            },
        )
        buckets = resp.get("aggregations", {}).get("q", {}).get("buckets", [])
        items = [
            {
                "query": b["key"],
                "count": b["doc_count"],
                "zero_results": b.get("zero", {}).get("doc_count", 0),
                "avg_latency_ms": b.get("avg_latency", {}).get("value"),
            }
            for b in buckets
        ]
        return {
            "tenant": prefix,
            "days": days,
            "total_queries": _total(resp),
            "items": items,
        }

    def zero_results(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        resp = self._search(
            prefix,
            {
                "size": 0,
                "query": self._base_filter(
                    prefix, days, [{"term": {"type": EVENT_QUERY}}, {"term": {"zero_result": True}}]
                ),
                "track_total_hits": True,
                "aggs": {"q": {"terms": {"field": "query", "size": size}}},
            },
        )
        total_queries = self._count(prefix, days, [{"term": {"type": EVENT_QUERY}}])
        zero_total = _total(resp)
        buckets = resp.get("aggregations", {}).get("q", {}).get("buckets", [])
        items = [{"query": b["key"], "count": b["doc_count"]} for b in buckets]
        return {
            "tenant": prefix,
            "days": days,
            "total_zero_result_searches": zero_total,
            "zero_result_rate": (zero_total / total_queries) if total_queries else 0.0,
            "items": items,
        }

    def ctr(self, prefix: str, days: int, size: int) -> dict[str, Any]:
        resp = self._search(
            prefix,
            {
                "size": 0,
                "query": self._base_filter(
                    prefix, days, [{"terms": {"type": [EVENT_IMPRESSION, EVENT_CLICK]}}]
                ),
                "aggs": {
                    "impressions": {"filter": {"term": {"type": EVENT_IMPRESSION}}},
                    "clicks": {"filter": {"term": {"type": EVENT_CLICK}}},
                    "q": {
                        "terms": {"field": "query", "size": size},
                        "aggs": {
                            "impressions": {"filter": {"term": {"type": EVENT_IMPRESSION}}},
                            "clicks": {"filter": {"term": {"type": EVENT_CLICK}}},
                        },
                    },
                },
            },
        )
        aggs = resp.get("aggregations", {})
        total_imp = aggs.get("impressions", {}).get("doc_count", 0)
        total_clk = aggs.get("clicks", {}).get("doc_count", 0)
        items = []
        for b in aggs.get("q", {}).get("buckets", []):
            imp = b.get("impressions", {}).get("doc_count", 0)
            clk = b.get("clicks", {}).get("doc_count", 0)
            items.append(
                {
                    "query": b["key"],
                    "impressions": imp,
                    "clicks": clk,
                    "ctr": (clk / imp) if imp else 0.0,
                }
            )
        items.sort(key=lambda x: x["impressions"], reverse=True)
        return {
            "tenant": prefix,
            "days": days,
            "impressions": total_imp,
            "clicks": total_clk,
            "ctr": (total_clk / total_imp) if total_imp else 0.0,
            "items": items,
        }

    def latency(self, prefix: str, days: int) -> dict[str, Any]:
        resp = self._search(
            prefix,
            {
                "size": 0,
                "query": self._base_filter(
                    prefix, days, [{"term": {"type": EVENT_QUERY}}, {"exists": {"field": "latency_ms"}}]
                ),
                "track_total_hits": True,
                "aggs": {
                    "pct": {"percentiles": {"field": "latency_ms", "percents": [50, 90, 95, 99]}},
                    "avg": {"avg": {"field": "latency_ms"}},
                    "max": {"max": {"field": "latency_ms"}},
                },
            },
        )
        aggs = resp.get("aggregations", {})
        pct = aggs.get("pct", {}).get("values", {})
        return {
            "tenant": prefix,
            "days": days,
            "count": _total(resp),
            "avg_ms": aggs.get("avg", {}).get("value"),
            "p50_ms": pct.get("50.0"),
            "p90_ms": pct.get("90.0"),
            "p95_ms": pct.get("95.0"),
            "p99_ms": pct.get("99.0"),
            "max_ms": aggs.get("max", {}).get("value"),
        }

    def _count(self, prefix: str, days: int, extra: list[dict[str, Any]]) -> int:
        try:
            resp = self.client.count(
                index=self.index_for(prefix),
                query=self._base_filter(prefix, days, extra),
                ignore_unavailable=True,
                allow_no_indices=True,
            )
            return int(resp.get("count", 0))
        except Exception:
            return 0

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except Exception:
            return False

    def close(self) -> None:
        self._stop.set()
        self._wake.set()
        try:
            self.flush()
        except Exception:
            pass


def _total(resp: dict[str, Any]) -> int:
    total = resp.get("hits", {}).get("total", {})
    if isinstance(total, dict):
        return int(total.get("value", 0))
    return int(total or 0)
