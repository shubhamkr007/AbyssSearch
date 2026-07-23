from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from app.auth import require_admin
from app.config import get_settings
from app.metrics import REPORT_LATENCY
from app.schemas import (
    CtrReport,
    EventBatch,
    IngestResult,
    LatencyReport,
    TopQueriesReport,
    ZeroResultsReport,
)
from app.store import AnalyticsStore

router = APIRouter()


def get_store(request: Request) -> AnalyticsStore:
    return request.app.state.store


def _days(days: int | None) -> int:
    if days is None:
        return get_settings().default_report_days
    return max(1, min(days, 365))


@router.post("/events", response_model=IngestResult, dependencies=[Depends(require_admin)])
def ingest_events(batch: EventBatch, store: AnalyticsStore = Depends(get_store)) -> IngestResult:
    accepted, dropped = store.record(batch.tenant, batch.events)
    return IngestResult(accepted=accepted, dropped=dropped)


@router.get(
    "/reports/top-queries",
    response_model=TopQueriesReport,
    dependencies=[Depends(require_admin)],
)
def top_queries(
    tenant: str = Query(..., min_length=1),
    days: int | None = Query(default=None, ge=1, le=365),
    size: int = Query(default=10, ge=1, le=100),
    store: AnalyticsStore = Depends(get_store),
) -> TopQueriesReport:
    with REPORT_LATENCY.labels(report="top_queries").time():
        return TopQueriesReport(**store.top_queries(tenant, _days(days), size))


@router.get(
    "/reports/zero-results",
    response_model=ZeroResultsReport,
    dependencies=[Depends(require_admin)],
)
def zero_results(
    tenant: str = Query(..., min_length=1),
    days: int | None = Query(default=None, ge=1, le=365),
    size: int = Query(default=10, ge=1, le=100),
    store: AnalyticsStore = Depends(get_store),
) -> ZeroResultsReport:
    with REPORT_LATENCY.labels(report="zero_results").time():
        return ZeroResultsReport(**store.zero_results(tenant, _days(days), size))


@router.get("/reports/ctr", response_model=CtrReport, dependencies=[Depends(require_admin)])
def ctr(
    tenant: str = Query(..., min_length=1),
    days: int | None = Query(default=None, ge=1, le=365),
    size: int = Query(default=10, ge=1, le=100),
    store: AnalyticsStore = Depends(get_store),
) -> CtrReport:
    with REPORT_LATENCY.labels(report="ctr").time():
        return CtrReport(**store.ctr(tenant, _days(days), size))


@router.get("/reports/latency", response_model=LatencyReport, dependencies=[Depends(require_admin)])
def latency(
    tenant: str = Query(..., min_length=1),
    days: int | None = Query(default=None, ge=1, le=365),
    store: AnalyticsStore = Depends(get_store),
) -> LatencyReport:
    with REPORT_LATENCY.labels(report="latency").time():
        return LatencyReport(**store.latency(tenant, _days(days)))
