from __future__ import annotations

from fastapi import APIRouter, Request

from app.metrics import ANSWER_LATENCY, ANSWERS_TOTAL, LLM_FALLBACKS
from app.schemas import AnswerRequest, AnswerResponse

router = APIRouter()


@router.post("/answer", response_model=AnswerResponse)
def answer(req: AnswerRequest, request: Request) -> AnswerResponse:
    service = request.app.state.service
    res = service.answer(req)
    ANSWERS_TOTAL.labels(
        degraded=str(res.degraded).lower(),
        used_context=str(res.used_context).lower(),
    ).inc()
    if "llm_unavailable" in res.degraded_reasons:
        LLM_FALLBACKS.inc()
    ANSWER_LATENCY.observe(res.timings.total_ms / 1000)
    return res
