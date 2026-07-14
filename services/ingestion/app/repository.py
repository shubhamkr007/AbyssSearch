from __future__ import annotations

from typing import Protocol

from app.domain import DeadLetterRecord, JobRecord, TaskRecord


class JobRepository(Protocol):
    def create_job(self, job: JobRecord) -> JobRecord: ...
    def get_job(self, job_id: str) -> JobRecord | None: ...
    def list_jobs(
        self, tenant_id: str | None = None, status: str | None = None, limit: int = 50
    ) -> list[JobRecord]: ...
    def update_job(self, job: JobRecord) -> JobRecord: ...
    def create_task(self, task: TaskRecord) -> TaskRecord: ...
    def get_task(self, task_id: str) -> TaskRecord | None: ...
    def list_tasks(self, job_id: str) -> list[TaskRecord]: ...
    def update_task(self, task: TaskRecord) -> TaskRecord: ...
    def add_dead_letter(self, entry: DeadLetterRecord) -> DeadLetterRecord: ...
    def list_dead_letter(self, limit: int = 50) -> list[DeadLetterRecord]: ...
    def get_dead_letter(self, entry_id: str) -> DeadLetterRecord | None: ...
    def ping(self) -> bool: ...


class InMemoryJobRepository:
    """Dependency-free store for tests and USE_FAKE mode."""

    def __init__(self) -> None:
        self.jobs: dict[str, JobRecord] = {}
        self.tasks: dict[str, TaskRecord] = {}
        self.dead_letter: dict[str, DeadLetterRecord] = {}

    def create_job(self, job: JobRecord) -> JobRecord:
        self.jobs[job.id] = job
        return job

    def get_job(self, job_id: str) -> JobRecord | None:
        return self.jobs.get(job_id)

    def list_jobs(
        self, tenant_id: str | None = None, status: str | None = None, limit: int = 50
    ) -> list[JobRecord]:
        items = list(self.jobs.values())
        if tenant_id:
            items = [j for j in items if j.tenant_id == tenant_id]
        if status:
            items = [j for j in items if j.status == status]
        items.sort(key=lambda j: j.created_at, reverse=True)
        return items[:limit]

    def update_job(self, job: JobRecord) -> JobRecord:
        self.jobs[job.id] = job
        return job

    def create_task(self, task: TaskRecord) -> TaskRecord:
        self.tasks[task.id] = task
        return task

    def get_task(self, task_id: str) -> TaskRecord | None:
        return self.tasks.get(task_id)

    def list_tasks(self, job_id: str) -> list[TaskRecord]:
        return [t for t in self.tasks.values() if t.job_id == job_id]

    def update_task(self, task: TaskRecord) -> TaskRecord:
        self.tasks[task.id] = task
        return task

    def add_dead_letter(self, entry: DeadLetterRecord) -> DeadLetterRecord:
        self.dead_letter[entry.id] = entry
        return entry

    def list_dead_letter(self, limit: int = 50) -> list[DeadLetterRecord]:
        items = sorted(self.dead_letter.values(), key=lambda d: d.created_at, reverse=True)
        return items[:limit]

    def get_dead_letter(self, entry_id: str) -> DeadLetterRecord | None:
        return self.dead_letter.get(entry_id)

    def ping(self) -> bool:
        return True
