from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.embedding.service import EmbeddingService, OverloadedError
from app.metrics import (
    EMBED_BATCH_SIZE,
    EMBED_DURATION,
    EMBED_INFLIGHT,
    EMBED_OVERLOAD,
    EMBED_REQUESTS,
)
from app.schemas import EmbedRequest, EmbedResponse, ModelInfo

router = APIRouter(tags=["embedding"])


def get_service(request: Request) -> EmbeddingService:
    service = getattr(request.app.state, "embedding_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="embedding model not ready",
        )
    return service


@router.post("/embed", response_model=EmbedResponse)
async def embed(
    payload: EmbedRequest, service: EmbeddingService = Depends(get_service)
) -> EmbedResponse:
    if len(payload.texts) > service.max_batch_size:
        # 422 literal: the named Starlette constant was renamed across versions.
        raise HTTPException(
            status_code=422,
            detail=f"batch too large: {len(payload.texts)} > max_batch_size {service.max_batch_size}",
        )

    type_label = payload.type.value
    EMBED_BATCH_SIZE.observe(len(payload.texts))
    start = time.perf_counter()
    try:
        with EMBED_INFLIGHT.track_inprogress():
            vectors = await service.embed(payload.texts, payload.type)
    except OverloadedError as exc:
        EMBED_OVERLOAD.inc()
        EMBED_REQUESTS.labels(type=type_label, status="overloaded").inc()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="service overloaded"
        ) from exc

    EMBED_DURATION.labels(type=type_label).observe(time.perf_counter() - start)
    EMBED_REQUESTS.labels(type=type_label, status="ok").inc()
    return EmbedResponse(
        model=service.model_name,
        dim=service.dim,
        normalized=service.normalized,
        type=payload.type,
        vectors=vectors,
    )


@router.get("/model", response_model=ModelInfo)
async def model_info(service: EmbeddingService = Depends(get_service)) -> ModelInfo:
    return ModelInfo(
        model=service.model_name,
        dim=service.dim,
        normalized=service.normalized,
        backend=service.backend,
    )
