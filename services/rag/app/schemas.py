from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AnswerRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural-language question.")
    tenant_id: str = Field(..., min_length=1, description="Tenant id (mandatory ES filter).")
    prefix: str = Field(..., min_length=1, description="Tenant index prefix, e.g. 'demo'.")
    tab: str | None = None
    filters: dict | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)


class Citation(BaseModel):
    n: int
    id: str
    title: str | None = None
    url: str | None = None
    source: str | None = None
    score: float | None = None
    snippet: str | None = None


class Timings(BaseModel):
    embed_ms: int = 0
    retrieve_ms: int = 0
    llm_ms: int = 0
    total_ms: int = 0


class AnswerResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    query: str
    answer: str
    model: str
    used_context: bool
    degraded: bool
    degraded_reasons: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    timings: Timings = Field(default_factory=Timings)
