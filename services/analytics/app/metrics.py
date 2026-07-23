from prometheus_client import Counter, Histogram

EVENTS_INGESTED = Counter(
    "analytics_events_ingested_total", "Events accepted into the buffer", ["type"]
)
EVENTS_DROPPED = Counter(
    "analytics_events_dropped_total", "Events dropped before/at write", ["reason"]
)
FLUSH_LATENCY = Histogram("analytics_flush_seconds", "Bulk flush latency to Elasticsearch")
REPORT_LATENCY = Histogram(
    "analytics_report_seconds", "Report query latency", ["report"]
)
