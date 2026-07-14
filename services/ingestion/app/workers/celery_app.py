from celery import Celery

from app.config import get_settings


def make_celery() -> Celery:
    settings = get_settings()
    app = Celery(
        "ingestion",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        task_track_started=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_default_queue="ingest",
        task_routes={
            "ingestion.run_pipeline_task": {"queue": "ingest"},
            "ingestion.finalize_job": {"queue": "ingest"},
        },
    )
    return app


celery_app = make_celery()


@celery_app.task(name="ingestion.run_pipeline_task", bind=True, max_retries=3)
def run_pipeline_task(self, job_id: str, task_id: str) -> dict:
    """Celery entrypoint: executes one pipeline task against the shared store."""
    from app.wiring import build_orchestrator

    orch = build_orchestrator()
    try:
        orch.run_task(job_id, task_id)
        return {"job_id": job_id, "task_id": task_id, "status": "ok"}
    except Exception as exc:  # noqa: BLE001
        raise self.retry(exc=exc, countdown=2 ** self.request.retries) from exc


def enqueue_pipeline_task(job_id: str, task_id: str) -> None:
    run_pipeline_task.delay(job_id, task_id)
