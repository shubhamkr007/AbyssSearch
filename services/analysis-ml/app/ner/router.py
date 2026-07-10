from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.metrics import (
    NER_BATCH_SIZE,
    NER_DURATION,
    NER_ENTITIES,
    NER_INFLIGHT,
    NER_OVERLOAD,
    NER_REQUESTS,
)
from app.ner.service import NerService, OverloadedError
from app.schemas import Entity, NerModelInfo, NerRequest, NerResponse

router = APIRouter(tags=["ner"])


def get_service(request: Request) -> NerService:
    service = getattr(request.app.state, "ner_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ner model not ready",
        )
    return service


@router.post("/ner", response_model=NerResponse)
async def ner(payload: NerRequest, service: NerService = Depends(get_service)) -> NerResponse:
    if len(payload.texts) > service.max_batch_size:
        raise HTTPException(
            status_code=422,
            detail=f"batch too large: {len(payload.texts)} > max_batch_size {service.max_batch_size}",
        )

    NER_BATCH_SIZE.observe(len(payload.texts))
    start = time.perf_counter()
    try:
        with NER_INFLIGHT.track_inprogress():
            docs = await service.analyze(payload.texts, payload.types)
    except OverloadedError as exc:
        NER_OVERLOAD.inc()
        NER_REQUESTS.labels(status="overloaded").inc()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="service overloaded"
        ) from exc

    NER_DURATION.observe(time.perf_counter() - start)
    for doc_entities in docs:
        NER_ENTITIES.observe(len(doc_entities))
    NER_REQUESTS.labels(status="ok").inc()
    return NerResponse(entities=[[Entity(**e) for e in doc] for doc in docs])


@router.get("/ner/model", response_model=NerModelInfo)
async def ner_model(service: NerService = Depends(get_service)) -> NerModelInfo:
    return NerModelInfo(
        model=service.model_name,
        use_transformer=service.use_transformer,
        labels=service.labels,
        default_types=service.default_types,
    )
