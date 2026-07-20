from prometheus_client import Counter, Histogram

ANSWERS_TOTAL = Counter(
    "rag_answers_total", "RAG answer requests", ["degraded", "used_context"]
)
LLM_FALLBACKS = Counter("rag_llm_fallbacks_total", "Answers served via extractive fallback")
ANSWER_LATENCY = Histogram("rag_answer_latency_seconds", "End-to-end answer latency")
