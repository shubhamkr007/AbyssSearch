# Re-export celery app for `celery -A app.workers.celery_app.celery_app worker`
from app.workers.celery_app import celery_app, enqueue_pipeline_task, run_pipeline_task

__all__ = ["celery_app", "run_pipeline_task", "enqueue_pipeline_task"]
