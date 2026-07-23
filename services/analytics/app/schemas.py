from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# Known event types. Anything else is accepted and stored but ignored by the
# built-in reports (forward-compatible for custom client events).
EVENT_QUERY = "query"
EVENT_IMPRESSION = "impression"
EVENT_CLICK = "click"


class EventIn(BaseModel):
    """A single analytics event. The gateway forwards these snake_case fields;
    unknown fields are ignored so the client contract can evolve safely."""

    model_config = ConfigDict(extra="ignore")

    type: str = Field(..., min_length=1, max_length=32)
    query: str | None = Field(default=None, max_length=512)
    tab: str | None = Field(default=None, max_length=64)
    doc_id: str | None = Field(default=None, max_length=256)
    rank: int | None = Field(default=None, ge=0)
    result_count: int | None = Field(default=None, ge=0)
    latency_ms: int | None = Field(default=None, ge=0)
    zero_result: bool | None = None
    session_id: str | None = Field(default=None, max_length=128)
    # ISO-8601 timestamp; the server stamps `now` when omitted.
    ts: str | None = None


class EventBatch(BaseModel):
    tenant: str = Field(..., min_length=1, max_length=128, description="Tenant index prefix.")
    events: list[EventIn] = Field(default_factory=list)


class IngestResult(BaseModel):
    accepted: int
    dropped: int


class TopQuery(BaseModel):
    query: str
    count: int
    zero_results: int = 0
    avg_latency_ms: float | None = None


class TopQueriesReport(BaseModel):
    tenant: str
    days: int
    total_queries: int
    items: list[TopQuery] = Field(default_factory=list)


class ZeroResultQuery(BaseModel):
    query: str
    count: int


class ZeroResultsReport(BaseModel):
    tenant: str
    days: int
    total_zero_result_searches: int
    zero_result_rate: float
    items: list[ZeroResultQuery] = Field(default_factory=list)


class CtrRow(BaseModel):
    query: str
    impressions: int
    clicks: int
    ctr: float


class CtrReport(BaseModel):
    tenant: str
    days: int
    impressions: int
    clicks: int
    ctr: float
    items: list[CtrRow] = Field(default_factory=list)


class LatencyReport(BaseModel):
    tenant: str
    days: int
    count: int
    avg_ms: float | None = None
    p50_ms: float | None = None
    p90_ms: float | None = None
    p95_ms: float | None = None
    p99_ms: float | None = None
    max_ms: float | None = None
