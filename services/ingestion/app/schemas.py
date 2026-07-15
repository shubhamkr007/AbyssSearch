from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class JobType(str, Enum):
    INGEST = "ingest"
    REINDEX = "reindex"
    BUILD_SUGGEST = "build-suggest"
    ANALYZE = "analyze"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"
    FAILED = "failed"


class TaskKind(str, Enum):
    FETCH = "fetch"
    NORMALIZE = "normalize"
    CHUNK = "chunk"
    ENRICH = "enrich"
    INDEX = "index"
    THUMBNAIL = "thumbnail"
    PIPELINE = "pipeline"  # MVP: one task runs the full per-batch pipeline
    ANALYZE = "analyze"  # post-index NER enrichment of docs already in ES


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


# ---- request / response -------------------------------------------------


class InlineDocument(BaseModel):
    """Canonical-ish document supplied by the caller (pre-normalized text)."""

    title: str = Field(..., min_length=1, max_length=1024)
    body: str = Field(..., min_length=1)
    url: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    source: str = "document"
    natural_key: str | None = None


class IngestOptions(BaseModel):
    chunk: bool = True
    enrich: bool = True
    ensure_index: bool = True


class IngestJobRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1, max_length=64, alias="tenantId")
    tenant_prefix: str | None = Field(
        default=None,
        alias="tenantPrefix",
        description="ES index prefix; defaults to tenantId when omitted.",
    )
    source_id: str | None = Field(default=None, alias="sourceId")
    mode: str = "full"
    options: IngestOptions = Field(default_factory=IngestOptions)
    documents: list[InlineDocument] = Field(
        default_factory=list,
        description="Inline docs for MVP; connector-based fetch is Phase 1.5.",
        min_length=0,
    )

    model_config = {"populate_by_name": True}


class BulkDocumentsRequest(BaseModel):
    tenant_id: str = Field(..., alias="tenantId")
    tenant_prefix: str | None = Field(default=None, alias="tenantPrefix")
    documents: list[InlineDocument] = Field(..., min_length=1)
    options: IngestOptions = Field(default_factory=IngestOptions)

    model_config = {"populate_by_name": True}


class AnalyzeJobRequest(BaseModel):
    """Post-index NER enrichment: (re)generate typed entities for docs already in ES."""

    tenant_id: str = Field(..., min_length=1, max_length=64, alias="tenantId")
    tenant_prefix: str | None = Field(
        default=None,
        alias="tenantPrefix",
        description="ES index prefix; defaults to tenantId when omitted.",
    )
    source: str | None = Field(
        default=None,
        description="Source type (e.g. 'document'). Omit to scan every source index for the tenant.",
    )
    doc_ids: list[str] = Field(
        default_factory=list,
        alias="docIds",
        description="Analyze only these document ids. When empty, all docs in scope are analyzed.",
    )
    types: list[str] | None = Field(
        default=None,
        description="Optional entity-label filter, e.g. ['ORG','PERSON','GPE']. Null keeps all labels.",
    )
    limit: int = Field(
        default=1000,
        ge=1,
        le=10000,
        description="Max docs to scan when docIds is empty.",
    )

    model_config = {"populate_by_name": True}


class JobCounts(BaseModel):
    total: int = 0
    ok: int = 0
    failed: int = 0
    skipped: int = 0


class TaskView(BaseModel):
    id: str
    kind: str
    status: str
    attempts: int = 0
    error: str | None = None
    updated_at: datetime | None = None


class JobView(BaseModel):
    job_id: str = Field(..., alias="jobId")
    tenant_id: str = Field(..., alias="tenantId")
    source_id: str | None = Field(default=None, alias="sourceId")
    type: str
    status: str
    counts: JobCounts
    task_count: int = Field(0, alias="taskCount")
    tasks: list[TaskView] = Field(default_factory=list)
    created_at: datetime | None = Field(default=None, alias="createdAt")
    finished_at: datetime | None = Field(default=None, alias="finishedAt")

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class JobCreatedResponse(BaseModel):
    job_id: str = Field(..., alias="jobId")
    status: str
    task_count: int = Field(..., alias="taskCount")

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class BulkIndexResponse(BaseModel):
    indexed: int
    failed: int
    ids: list[str]
    index: str


class DeadLetterView(BaseModel):
    id: str
    task_id: str | None = Field(default=None, alias="taskId")
    error: str
    payload: dict[str, Any]
    created_at: datetime | None = Field(default=None, alias="createdAt")

    model_config = {"populate_by_name": True, "serialize_by_alias": True}
