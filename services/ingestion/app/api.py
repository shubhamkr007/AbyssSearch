from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.auth import require_admin
from app.metrics import (
    DOCS_ANALYZED,
    DOCS_FAILED,
    DOCS_INDEXED,
    JOBS_CREATED,
    JOBS_FINISHED,
)
from app.orchestrator import Orchestrator
from app.schemas import (
    AnalyzeJobRequest,
    BulkDocumentsRequest,
    BulkIndexResponse,
    DeadLetterView,
    IngestJobRequest,
    JobCreatedResponse,
    JobView,
)

router = APIRouter(tags=["ingestion"])


def get_orchestrator(request: Request) -> Orchestrator:
    return request.app.state.orchestrator


@router.post("/jobs/ingest", response_model=JobCreatedResponse, dependencies=[Depends(require_admin)])
def create_ingest_job(
    body: IngestJobRequest,
    orch: Orchestrator = Depends(get_orchestrator),
) -> JobCreatedResponse:
    try:
        result = orch.start_ingest(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    JOBS_CREATED.labels(type="ingest").inc()
    # Reflect final status metrics when inline.
    job = orch.get_job(result.job_id)
    if job and job.status in ("succeeded", "partial", "failed"):
        JOBS_FINISHED.labels(status=job.status).inc()
        DOCS_INDEXED.inc(job.counts.ok)
        DOCS_FAILED.inc(job.counts.failed)
    return result


@router.post(
    "/jobs/analyze",
    response_model=JobCreatedResponse,
    dependencies=[Depends(require_admin)],
)
def create_analyze_job(
    body: AnalyzeJobRequest,
    orch: Orchestrator = Depends(get_orchestrator),
) -> JobCreatedResponse:
    try:
        result = orch.start_analyze(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    JOBS_CREATED.labels(type="analyze").inc()
    job = orch.get_job(result.job_id)
    if job and job.status in ("succeeded", "partial", "failed"):
        JOBS_FINISHED.labels(status=job.status).inc()
        DOCS_ANALYZED.inc(job.counts.ok)
    return result


@router.get("/jobs/{job_id}", response_model=JobView, dependencies=[Depends(require_admin)])
def get_job(job_id: str, orch: Orchestrator = Depends(get_orchestrator)) -> JobView:
    job = orch.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/jobs", response_model=list[JobView], dependencies=[Depends(require_admin)])
def list_jobs(
    tenantId: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    orch: Orchestrator = Depends(get_orchestrator),
) -> list[JobView]:
    return orch.list_jobs(tenant_id=tenantId, status=status, limit=limit)


@router.post(
    "/documents:bulk",
    response_model=BulkIndexResponse,
    dependencies=[Depends(require_admin)],
)
def bulk_documents(
    body: BulkDocumentsRequest,
    orch: Orchestrator = Depends(get_orchestrator),
) -> BulkIndexResponse:
    if len(body.documents) > orch.settings.max_bulk_batch:
        raise HTTPException(
            status_code=400,
            detail=f"batch too large; max {orch.settings.max_bulk_batch}",
        )
    result = orch.bulk_upsert(body)
    DOCS_INDEXED.inc(result.indexed)
    DOCS_FAILED.inc(result.failed)
    return result


@router.get(
    "/dead-letter",
    response_model=list[DeadLetterView],
    dependencies=[Depends(require_admin)],
)
def list_dead_letter(
    limit: int = Query(default=50, ge=1, le=200),
    orch: Orchestrator = Depends(get_orchestrator),
) -> list[DeadLetterView]:
    return orch.list_dead_letter(limit=limit)


@router.post(
    "/dead-letter/{entry_id}:replay",
    response_model=JobCreatedResponse,
    dependencies=[Depends(require_admin)],
)
def replay_dead_letter(
    entry_id: str,
    orch: Orchestrator = Depends(get_orchestrator),
) -> JobCreatedResponse:
    result = orch.replay_dead_letter(entry_id)
    if not result:
        raise HTTPException(status_code=404, detail="dead-letter entry not found")
    JOBS_CREATED.labels(type="ingest").inc()
    return result
