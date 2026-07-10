from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from starlette.responses import Response

EMBED_REQUESTS = Counter(
    "embed_requests_total", "Total /embed requests.", ["type", "status"]
)
EMBED_DURATION = Histogram(
    "embed_duration_seconds", "Embedding compute latency in seconds.", ["type"]
)
EMBED_BATCH_SIZE = Histogram(
    "embed_batch_size",
    "Number of texts per /embed request.",
    buckets=(1, 2, 4, 8, 16, 32, 64, 128),
)
EMBED_OVERLOAD = Counter(
    "embed_overload_total", "Requests rejected with 429 due to overload."
)
EMBED_INFLIGHT = Gauge("embed_inflight", "In-flight embedding computations.")

NER_REQUESTS = Counter("ner_requests_total", "Total /ner requests.", ["status"])
NER_DURATION = Histogram("ner_duration_seconds", "NER compute latency in seconds.")
NER_BATCH_SIZE = Histogram(
    "ner_batch_size",
    "Number of texts per /ner request.",
    buckets=(1, 2, 4, 8, 16, 32, 64, 128),
)
NER_ENTITIES = Histogram(
    "ner_entities_per_doc",
    "Entities extracted per document.",
    buckets=(0, 1, 2, 5, 10, 20, 50, 100),
)
NER_OVERLOAD = Counter("ner_overload_total", "Requests rejected with 429 due to overload.")
NER_INFLIGHT = Gauge("ner_inflight", "In-flight NER computations.")


def metrics_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
