"""Job orchestration: create jobs/tasks, run inline or enqueue Celery."""

from __future__ import annotations

from typing import Any

from app.clients.enrich import EmbedClient, NerClient
from app.clients.indexer import IndexBackend
from app.config import Settings
from app.domain import DeadLetterRecord, JobRecord, TaskRecord, new_id, utcnow
from app.pipeline.runner import run_pipeline
from app.repository import JobRepository
from app.schemas import (
    BulkDocumentsRequest,
    BulkIndexResponse,
    DeadLetterView,
    IngestJobRequest,
    InlineDocument,
    JobCounts,
    JobCreatedResponse,
    JobStatus,
    JobType,
    JobView,
    TaskKind,
    TaskStatus,
    TaskView,
)


class Orchestrator:
    def __init__(
        self,
        repo: JobRepository,
        embed: EmbedClient,
        ner: NerClient,
        indexer: IndexBackend,
        settings: Settings,
        enqueue_fn=None,
    ) -> None:
        self.repo = repo
        self.embed = embed
        self.ner = ner
        self.indexer = indexer
        self.settings = settings
        self.enqueue_fn = enqueue_fn

    def start_ingest(self, req: IngestJobRequest) -> JobCreatedResponse:
        if not req.documents:
            raise ValueError("documents required for MVP ingest (connector fetch is Phase 1.5)")

        prefix = req.tenant_prefix or req.tenant_id
        job = JobRecord(
            id=new_id("job_"),
            tenant_id=req.tenant_id,
            tenant_prefix=prefix,
            source_id=req.source_id,
            type=JobType.INGEST.value,
            status=JobStatus.QUEUED.value,
            counts={"total": len(req.documents), "ok": 0, "failed": 0},
            options=req.options.model_dump(),
            payload={"documents": [d.model_dump() for d in req.documents], "mode": req.mode},
        )
        self.repo.create_job(job)

        # One pipeline task per batch (MVP fan-out is a single batch).
        batches = _batch(req.documents, self.settings.max_bulk_batch)
        tasks: list[TaskRecord] = []
        for batch in batches:
            task = TaskRecord(
                id=new_id("task_"),
                job_id=job.id,
                kind=TaskKind.PIPELINE.value,
                status=TaskStatus.QUEUED.value,
                payload={"documents": [d.model_dump() for d in batch]},
            )
            self.repo.create_task(task)
            tasks.append(task)

        if self.settings.use_inline or self.enqueue_fn is None:
            self._run_job_inline(job.id)
        else:
            for task in tasks:
                self.enqueue_fn(job.id, task.id)

        refreshed = self.repo.get_job(job.id)
        assert refreshed is not None
        return JobCreatedResponse(
            jobId=refreshed.id,
            status=refreshed.status,
            taskCount=len(tasks),
        )

    def bulk_upsert(self, req: BulkDocumentsRequest) -> BulkIndexResponse:
        prefix = req.tenant_prefix or req.tenant_id
        result = run_pipeline(
            tenant_id=req.tenant_id,
            tenant_prefix=prefix,
            documents=req.documents,
            embed=self.embed,
            ner=self.ner,
            indexer=self.indexer,
            chunk=req.options.chunk,
            enrich=req.options.enrich,
            ensure_index=req.options.ensure_index,
            chunk_size=self.settings.default_chunk_size,
            chunk_overlap=self.settings.default_chunk_overlap,
        )
        return BulkIndexResponse(
            indexed=result["ok"],
            failed=result["failed"],
            ids=result["ids"],
            index=result["index"],
        )

    def get_job(self, job_id: str) -> JobView | None:
        job = self.repo.get_job(job_id)
        if not job:
            return None
        tasks = self.repo.list_tasks(job_id)
        return _to_job_view(job, tasks)

    def list_jobs(
        self, tenant_id: str | None = None, status: str | None = None, limit: int = 50
    ) -> list[JobView]:
        jobs = self.repo.list_jobs(tenant_id=tenant_id, status=status, limit=limit)
        return [_to_job_view(j, self.repo.list_tasks(j.id)) for j in jobs]

    def list_dead_letter(self, limit: int = 50) -> list[DeadLetterView]:
        return [
            DeadLetterView(
                id=d.id,
                taskId=d.task_id,
                error=d.error,
                payload=d.payload,
                createdAt=d.created_at,
            )
            for d in self.repo.list_dead_letter(limit=limit)
        ]

    def replay_dead_letter(self, entry_id: str) -> JobCreatedResponse | None:
        entry = self.repo.get_dead_letter(entry_id)
        if not entry:
            return None
        docs_raw = entry.payload.get("documents") or []
        docs = [InlineDocument.model_validate(d) for d in docs_raw]
        tenant_id = str(entry.payload.get("tenant_id") or "unknown")
        prefix = str(entry.payload.get("tenant_prefix") or tenant_id)
        return self.start_ingest(
            IngestJobRequest(
                tenantId=tenant_id,
                tenantPrefix=prefix,
                documents=docs,
            )
        )

    def run_task(self, job_id: str, task_id: str) -> None:
        """Execute a single pipeline task (called inline or from Celery)."""
        job = self.repo.get_job(job_id)
        task = self.repo.get_task(task_id)
        if not job or not task:
            return

        task.status = TaskStatus.RUNNING.value
        task.attempts += 1
        task.updated_at = utcnow()
        self.repo.update_task(task)

        job.status = JobStatus.RUNNING.value
        self.repo.update_job(job)

        try:
            docs = [InlineDocument.model_validate(d) for d in (task.payload.get("documents") or [])]
            result = run_pipeline(
                tenant_id=job.tenant_id,
                tenant_prefix=job.tenant_prefix,
                documents=docs,
                embed=self.embed,
                ner=self.ner,
                indexer=self.indexer,
                chunk=bool(job.options.get("chunk", True)),
                enrich=bool(job.options.get("enrich", True)),
                ensure_index=bool(job.options.get("ensure_index", True)),
                chunk_size=self.settings.default_chunk_size,
                chunk_overlap=self.settings.default_chunk_overlap,
            )
            task.status = TaskStatus.SUCCEEDED.value
            task.error = None
            task.payload = {**task.payload, "result": result}
            task.updated_at = utcnow()
            self.repo.update_task(task)

            job.counts["ok"] = int(job.counts.get("ok", 0)) + int(result["ok"])
            job.counts["failed"] = int(job.counts.get("failed", 0)) + int(result["failed"])
            self.repo.update_job(job)
        except Exception as exc:  # noqa: BLE001 - convert to dead-letter
            task.status = TaskStatus.FAILED.value
            task.error = str(exc)
            task.updated_at = utcnow()
            self.repo.update_task(task)
            job.counts["failed"] = int(job.counts.get("failed", 0)) + len(
                task.payload.get("documents") or []
            )
            self.repo.update_job(job)
            self.repo.add_dead_letter(
                DeadLetterRecord(
                    id=new_id("dl_"),
                    task_id=task.id,
                    payload={
                        "tenant_id": job.tenant_id,
                        "tenant_prefix": job.tenant_prefix,
                        "documents": task.payload.get("documents") or [],
                    },
                    error=str(exc),
                )
            )

        self._finalize_job(job_id)

    def _run_job_inline(self, job_id: str) -> None:
        for task in self.repo.list_tasks(job_id):
            self.run_task(job_id, task.id)

    def _finalize_job(self, job_id: str) -> None:
        job = self.repo.get_job(job_id)
        if not job:
            return
        tasks = self.repo.list_tasks(job_id)
        if not tasks or any(t.status in (TaskStatus.QUEUED.value, TaskStatus.RUNNING.value) for t in tasks):
            return

        failed = sum(1 for t in tasks if t.status == TaskStatus.FAILED.value)
        succeeded = sum(1 for t in tasks if t.status == TaskStatus.SUCCEEDED.value)
        if failed == 0:
            job.status = JobStatus.SUCCEEDED.value
        elif succeeded == 0:
            job.status = JobStatus.FAILED.value
        else:
            job.status = JobStatus.PARTIAL.value
        job.finished_at = utcnow()
        self.repo.update_job(job)


def _batch(items: list[InlineDocument], size: int) -> list[list[InlineDocument]]:
    size = max(1, size)
    return [items[i : i + size] for i in range(0, len(items), size)]


def _to_job_view(job: JobRecord, tasks: list[TaskRecord]) -> JobView:
    return JobView(
        jobId=job.id,
        tenantId=job.tenant_id,
        sourceId=job.source_id,
        type=job.type,
        status=job.status,
        counts=JobCounts(**job.counts),
        taskCount=len(tasks),
        tasks=[
            TaskView(
                id=t.id,
                kind=t.kind,
                status=t.status,
                attempts=t.attempts,
                error=t.error,
                updated_at=t.updated_at,
            )
            for t in tasks
        ],
        createdAt=job.created_at,
        finishedAt=job.finished_at,
    )
