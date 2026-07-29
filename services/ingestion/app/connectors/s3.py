"""S3 / MinIO connector (boto3)."""

from __future__ import annotations

import io
import logging
from datetime import datetime
from typing import Any

from app.config import Settings
from app.connectors.base import ObjectContent, RemoteObject

log = logging.getLogger(__name__)

DEFAULT_SUFFIXES = (".txt", ".md", ".pdf")


def _as_str(config: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        val = config.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return default


def _as_bool(config: dict[str, Any], key: str, default: bool) -> bool:
    val = config.get(key)
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().lower() in ("1", "true", "yes", "on")
    return default


def _as_int(config: dict[str, Any], key: str, default: int) -> int:
    val = config.get(key)
    if isinstance(val, int) and val > 0:
        return val
    if isinstance(val, str) and val.isdigit():
        return int(val)
    return default


def _suffixes(config: dict[str, Any]) -> tuple[str, ...]:
    raw = config.get("includeSuffixes")
    if isinstance(raw, list) and raw:
        return tuple(str(s).lower() for s in raw)
    return DEFAULT_SUFFIXES


def normalize_prefix(prefix: str) -> str:
    p = (prefix or "").strip().lstrip("/")
    if p and not p.endswith("/"):
        p = f"{p}/"
    return p


def relative_key(full_key: str, prefix: str) -> str:
    p = normalize_prefix(prefix)
    if p and full_key.startswith(p):
        return full_key[len(p) :]
    return full_key


def extract_text(key: str, body: bytes) -> str | None:
    """Extract UTF-8 text from .txt/.md; PDF via pypdf when available."""
    lower = key.lower()
    if lower.endswith((".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm")):
        for encoding in ("utf-8", "utf-8-sig", "latin-1"):
            try:
                return body.decode(encoding)
            except UnicodeDecodeError:
                continue
        return body.decode("utf-8", errors="replace")

    if lower.endswith(".pdf"):
        try:
            from pypdf import PdfReader
        except ImportError:
            log.warning("pypdf not installed; skipping PDF %s", key)
            return None
        try:
            reader = PdfReader(io.BytesIO(body))
            parts = [(page.extract_text() or "") for page in reader.pages]
            text = "\n".join(parts).strip()
            return text or None
        except Exception as exc:  # noqa: BLE001
            log.warning("failed to extract PDF %s: %s", key, exc)
            return None

    log.warning("unsupported object type for text extract: %s", key)
    return None


class S3Connector:
    def __init__(
        self,
        *,
        endpoint: str,
        bucket: str,
        prefix: str = "",
        region: str = "us-east-1",
        access_key_id: str,
        secret_access_key: str,
        use_path_style: bool = True,
        include_suffixes: tuple[str, ...] = DEFAULT_SUFFIXES,
        max_keys: int = 500,
        client: Any | None = None,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.bucket = bucket
        self.prefix = normalize_prefix(prefix)
        self.region = region
        self.include_suffixes = tuple(s.lower() for s in include_suffixes)
        self.max_keys = max(1, max_keys)
        if client is not None:
            self.client = client
        else:
            import boto3
            from botocore.config import Config

            self.client = boto3.client(
                "s3",
                endpoint_url=self.endpoint or None,
                region_name=self.region,
                aws_access_key_id=access_key_id,
                aws_secret_access_key=secret_access_key,
                config=Config(s3={"addressing_style": "path" if use_path_style else "auto"}),
            )

    def list_objects(self, *, max_keys: int | None = None) -> list[RemoteObject]:
        limit = max_keys if max_keys is not None else self.max_keys
        out: list[RemoteObject] = []
        token: str | None = None
        while len(out) < limit:
            kwargs: dict[str, Any] = {
                "Bucket": self.bucket,
                "MaxKeys": min(1000, limit - len(out)),
            }
            if self.prefix:
                kwargs["Prefix"] = self.prefix
            if token:
                kwargs["ContinuationToken"] = token
            resp = self.client.list_objects_v2(**kwargs)
            for item in resp.get("Contents") or []:
                key = str(item.get("Key") or "")
                if not key or key.endswith("/"):
                    continue
                if self.include_suffixes and not key.lower().endswith(self.include_suffixes):
                    continue
                lm = item.get("LastModified")
                if isinstance(lm, datetime):
                    last_modified = lm
                else:
                    last_modified = None
                out.append(
                    RemoteObject(
                        key=key,
                        natural_key=relative_key(key, self.prefix),
                        last_modified=last_modified,
                        etag=str(item["ETag"]).strip('"') if item.get("ETag") else None,
                        size=int(item["Size"]) if item.get("Size") is not None else None,
                    )
                )
                if len(out) >= limit:
                    break
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
            if not token:
                break
        return out

    def read_object(self, obj: RemoteObject) -> ObjectContent:
        resp = self.client.get_object(Bucket=self.bucket, Key=obj.key)
        body = resp["Body"].read()
        lm = resp.get("LastModified")
        return ObjectContent(
            key=obj.key,
            natural_key=obj.natural_key,
            body_bytes=body,
            content_type=resp.get("ContentType"),
            etag=str(resp["ETag"]).strip('"') if resp.get("ETag") else obj.etag,
            last_modified=lm if isinstance(lm, datetime) else obj.last_modified,
        )


def build_s3_connector(config: dict[str, Any], settings: Settings, client: Any | None = None) -> S3Connector:
    endpoint = _as_str(config, "endpoint", default=settings.minio_endpoint)
    bucket = _as_str(config, "bucket")
    if not bucket:
        raise ValueError("connectorConfig.bucket is required")
    access = _as_str(config, "accessKeyId", "accessKey", default=settings.minio_access_key)
    secret = _as_str(config, "secretAccessKey", "secretKey", default=settings.minio_secret_key)
    region = _as_str(config, "region", default=settings.minio_region) or "us-east-1"
    return S3Connector(
        endpoint=endpoint,
        bucket=bucket,
        prefix=_as_str(config, "prefix"),
        region=region,
        access_key_id=access,
        secret_access_key=secret,
        use_path_style=_as_bool(config, "usePathStyle", True),
        include_suffixes=_suffixes(config),
        max_keys=_as_int(config, "maxKeys", 500),
        client=client,
    )


class FakeS3Connector:
    """Deterministic in-memory S3 for unit tests."""

    def __init__(
        self,
        objects: dict[str, bytes] | None = None,
        *,
        prefix: str = "",
        include_suffixes: tuple[str, ...] = DEFAULT_SUFFIXES,
        last_modified: dict[str, datetime] | None = None,
        etags: dict[str, str] | None = None,
        bucket: str = "content",
        max_keys: int = 500,
    ) -> None:
        self.prefix = normalize_prefix(prefix)
        self.include_suffixes = include_suffixes
        self.bucket = bucket
        self.max_keys = max_keys
        self._objects = dict(objects or {})
        self._last_modified = dict(last_modified or {})
        self._etags = dict(etags or {})

    def list_objects(self, *, max_keys: int | None = None) -> list[RemoteObject]:
        limit = max_keys if max_keys is not None else 10_000
        out: list[RemoteObject] = []
        for key in sorted(self._objects):
            if self.prefix and not key.startswith(self.prefix):
                continue
            if key.endswith("/"):
                continue
            if self.include_suffixes and not key.lower().endswith(self.include_suffixes):
                continue
            out.append(
                RemoteObject(
                    key=key,
                    natural_key=relative_key(key, self.prefix),
                    last_modified=self._last_modified.get(key),
                    etag=self._etags.get(key, "etag"),
                    size=len(self._objects[key]),
                )
            )
            if len(out) >= limit:
                break
        return out

    def read_object(self, obj: RemoteObject) -> ObjectContent:
        if obj.key not in self._objects:
            raise KeyError(obj.key)
        return ObjectContent(
            key=obj.key,
            natural_key=obj.natural_key,
            body_bytes=self._objects[obj.key],
            content_type="text/plain",
            etag=self._etags.get(obj.key, obj.etag),
            last_modified=self._last_modified.get(obj.key, obj.last_modified),
        )
