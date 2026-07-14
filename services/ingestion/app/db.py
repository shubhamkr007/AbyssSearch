"""SQLAlchemy-backed job repository (PostgreSQL / SQLite)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from app.domain import DeadLetterRecord, JobRecord, TaskRecord, utcnow


class Base(DeclarativeBase):
    pass


class JobRow(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    tenant_prefix: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), index=True)
    counts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    options: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    job_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DeadLetterRow(Base):
    __tablename__ = "dead_letter"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    error: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


def create_db_engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, future=True, connect_args=connect_args)


class SqlAlchemyJobRepository:
    def __init__(self, engine) -> None:
        self.engine = engine
        Base.metadata.create_all(engine)

    def _session(self) -> Session:
        return Session(self.engine, expire_on_commit=False)

    def create_job(self, job: JobRecord) -> JobRecord:
        with self._session() as s:
            s.add(_job_to_row(job))
            s.commit()
        return job

    def get_job(self, job_id: str) -> JobRecord | None:
        with self._session() as s:
            row = s.get(JobRow, job_id)
            return _row_to_job(row) if row else None

    def list_jobs(
        self, tenant_id: str | None = None, status: str | None = None, limit: int = 50
    ) -> list[JobRecord]:
        with self._session() as s:
            stmt = select(JobRow).order_by(JobRow.created_at.desc()).limit(limit)
            if tenant_id:
                stmt = stmt.where(JobRow.tenant_id == tenant_id)
            if status:
                stmt = stmt.where(JobRow.status == status)
            return [_row_to_job(r) for r in s.scalars(stmt)]

    def update_job(self, job: JobRecord) -> JobRecord:
        with self._session() as s:
            row = s.get(JobRow, job.id)
            if not row:
                raise KeyError(job.id)
            row.status = job.status
            row.counts = dict(job.counts)
            row.options = dict(job.options)
            row.payload = dict(job.payload)
            row.finished_at = job.finished_at
            s.commit()
        return job

    def create_task(self, task: TaskRecord) -> TaskRecord:
        with self._session() as s:
            s.add(_task_to_row(task))
            s.commit()
        return task

    def get_task(self, task_id: str) -> TaskRecord | None:
        with self._session() as s:
            row = s.get(TaskRow, task_id)
            return _row_to_task(row) if row else None

    def list_tasks(self, job_id: str) -> list[TaskRecord]:
        with self._session() as s:
            stmt = select(TaskRow).where(TaskRow.job_id == job_id)
            return [_row_to_task(r) for r in s.scalars(stmt)]

    def update_task(self, task: TaskRecord) -> TaskRecord:
        with self._session() as s:
            row = s.get(TaskRow, task.id)
            if not row:
                raise KeyError(task.id)
            row.status = task.status
            row.attempts = task.attempts
            row.error = task.error
            row.payload = dict(task.payload)
            row.updated_at = task.updated_at or utcnow()
            s.commit()
        return task

    def add_dead_letter(self, entry: DeadLetterRecord) -> DeadLetterRecord:
        with self._session() as s:
            s.add(
                DeadLetterRow(
                    id=entry.id,
                    task_id=entry.task_id,
                    payload=entry.payload,
                    error=entry.error,
                    created_at=entry.created_at,
                )
            )
            s.commit()
        return entry

    def list_dead_letter(self, limit: int = 50) -> list[DeadLetterRecord]:
        with self._session() as s:
            stmt = select(DeadLetterRow).order_by(DeadLetterRow.created_at.desc()).limit(limit)
            return [
                DeadLetterRecord(
                    id=r.id,
                    task_id=r.task_id,
                    payload=dict(r.payload or {}),
                    error=r.error,
                    created_at=r.created_at,
                )
                for r in s.scalars(stmt)
            ]

    def get_dead_letter(self, entry_id: str) -> DeadLetterRecord | None:
        with self._session() as s:
            row = s.get(DeadLetterRow, entry_id)
            if not row:
                return None
            return DeadLetterRecord(
                id=row.id,
                task_id=row.task_id,
                payload=dict(row.payload or {}),
                error=row.error,
                created_at=row.created_at,
            )

    def ping(self) -> bool:
        try:
            with self.engine.connect() as conn:
                conn.exec_driver_sql("SELECT 1")
            return True
        except Exception:
            return False


def _job_to_row(job: JobRecord) -> JobRow:
    return JobRow(
        id=job.id,
        tenant_id=job.tenant_id,
        tenant_prefix=job.tenant_prefix,
        source_id=job.source_id,
        type=job.type,
        status=job.status,
        counts=dict(job.counts),
        options=dict(job.options),
        payload=dict(job.payload),
        created_at=job.created_at,
        finished_at=job.finished_at,
    )


def _row_to_job(row: JobRow) -> JobRecord:
    return JobRecord(
        id=row.id,
        tenant_id=row.tenant_id,
        tenant_prefix=row.tenant_prefix,
        source_id=row.source_id,
        type=row.type,
        status=row.status,
        counts=dict(row.counts or {}),
        options=dict(row.options or {}),
        payload=dict(row.payload or {}),
        created_at=row.created_at,
        finished_at=row.finished_at,
    )


def _task_to_row(task: TaskRecord) -> TaskRow:
    return TaskRow(
        id=task.id,
        job_id=task.job_id,
        kind=task.kind,
        status=task.status,
        attempts=task.attempts,
        error=task.error,
        payload=dict(task.payload),
        updated_at=task.updated_at,
    )


def _row_to_task(row: TaskRow) -> TaskRecord:
    return TaskRecord(
        id=row.id,
        job_id=row.job_id,
        kind=row.kind,
        status=row.status,
        attempts=row.attempts,
        error=row.error,
        payload=dict(row.payload or {}),
        updated_at=row.updated_at,
    )
