from __future__ import annotations

from pydantic import BaseModel, Field


class Candidate(BaseModel):
    id: str = Field(..., min_length=1, max_length=256)
    text: str = Field(default="", max_length=8000)


class RerankRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1024)
    candidates: list[Candidate] = Field(default_factory=list)
    top_k: int = Field(default=10, ge=1, le=100)


class RankedResult(BaseModel):
    id: str
    score: float


class RerankResponse(BaseModel):
    results: list[RankedResult] = Field(default_factory=list)
    skipped: bool = False
    reason: str | None = None
