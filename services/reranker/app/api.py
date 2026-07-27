from __future__ import annotations

from fastapi import APIRouter, Request

from app.schemas import RerankRequest, RerankResponse

router = APIRouter()


@router.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest, request: Request) -> RerankResponse:
    service = request.app.state.service
    return service.rerank(req)
