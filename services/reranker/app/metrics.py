from prometheus_client import Counter, Histogram

RERANK_REQUESTS = Counter(
    "reranker_requests_total",
    "Rerank requests",
    ["outcome"],  # ok | skipped | error
)
RERANK_CANDIDATES = Counter(
    "reranker_candidates_total",
    "Candidates scored",
)
RERANK_LATENCY = Histogram(
    "reranker_seconds",
    "Rerank wall time",
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
)
RERANK_SKIPPED = Counter(
    "reranker_skipped_total",
    "Reranks skipped",
    ["reason"],
)
