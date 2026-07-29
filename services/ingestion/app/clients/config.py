"""HTTP client for Tenant Config (S4) source lookups."""

from __future__ import annotations

from typing import Any

import httpx


class ConfigClient:
    """Fetches tenant sources from S4 (admin token; secrets via includeSecrets)."""

    def __init__(self, base_url: str, admin_token: str, timeout_ms: int = 5000) -> None:
        self.base_url = base_url.rstrip("/")
        self.admin_token = admin_token
        self.timeout = timeout_ms / 1000

    def _headers(self) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self.admin_token}",
            "x-admin-actor": "ingestion",
            "accept": "application/json",
        }

    def get_source(
        self, tenant_id: str, source_id: str, *, include_secrets: bool = True
    ) -> dict[str, Any]:
        params = {"includeSecrets": "true"} if include_secrets else {}
        url = f"{self.base_url}/tenants/{tenant_id}/sources/{source_id}"
        with httpx.Client(timeout=self.timeout) as client:
            resp = client.get(url, headers=self._headers(), params=params)
            resp.raise_for_status()
            return resp.json()


class FakeConfigClient:
    """In-memory source store for unit tests."""

    def __init__(self, sources: dict[str, dict[str, Any]] | None = None) -> None:
        # key: f"{tenant_id}:{source_id}"
        self.sources: dict[str, dict[str, Any]] = dict(sources or {})

    def put(self, tenant_id: str, source: dict[str, Any]) -> None:
        sid = str(source["id"])
        self.sources[f"{tenant_id}:{sid}"] = source

    def get_source(
        self, tenant_id: str, source_id: str, *, include_secrets: bool = True
    ) -> dict[str, Any]:
        key = f"{tenant_id}:{source_id}"
        source = self.sources.get(key)
        if not source:
            raise LookupError(f"source '{source_id}' not found for tenant '{tenant_id}'")
        return dict(source)
