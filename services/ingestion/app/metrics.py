from prometheus_client import Counter, Histogram

JOBS_CREATED = Counter("ingestion_jobs_created_total", "Jobs created.", ["type"])
JOBS_FINISHED = Counter("ingestion_jobs_finished_total", "Jobs finished.", ["status"])
DOCS_INDEXED = Counter("ingestion_docs_indexed_total", "Documents indexed.")
DOCS_FAILED = Counter("ingestion_docs_failed_total", "Documents that failed indexing.")
PIPELINE_DURATION = Histogram(
    "ingestion_pipeline_duration_seconds",
    "Pipeline latency.",
    buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 60),
)
DEAD_LETTER = Counter("ingestion_dead_letter_total", "Dead-letter entries written.")
