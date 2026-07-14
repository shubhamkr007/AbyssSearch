from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass
class JobRecord:
    id: str
    tenant_id: str
    tenant_prefix: str
    source_id: str | None
    type: str
    status: str
    counts: dict[str, int] = field(default_factory=lambda: {"total": 0, "ok": 0, "failed": 0})
    options: dict[str, Any] = field(default_factory=dict)
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utcnow)
    finished_at: datetime | None = None


@dataclass
class TaskRecord:
    id: str
    job_id: str
    kind: str
    status: str
    attempts: int = 0
    error: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=utcnow)


@dataclass
class DeadLetterRecord:
    id: str
    task_id: str | None
    payload: dict[str, Any]
    error: str
    created_at: datetime = field(default_factory=utcnow)


def new_id(prefix: str = "") -> str:
    raw = uuid4().hex
    return f"{prefix}{raw}" if prefix else raw
