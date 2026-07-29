"""Connector protocol for object-store style sources."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class RemoteObject:
    """A listed object from a connector."""

    key: str
    """Full object key in the bucket."""

    natural_key: str
    """Key relative to the configured prefix (idempotent natural key)."""

    last_modified: datetime | None
    etag: str | None
    size: int | None = None


@dataclass(frozen=True)
class ObjectContent:
    key: str
    natural_key: str
    body_bytes: bytes
    content_type: str | None
    etag: str | None
    last_modified: datetime | None


class Connector(Protocol):
    def list_objects(self, *, max_keys: int | None = None) -> list[RemoteObject]: ...

    def read_object(self, obj: RemoteObject) -> ObjectContent: ...
