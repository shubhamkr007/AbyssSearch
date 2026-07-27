import os

# Force fake backend for the whole test suite (no model download).
os.environ["USE_FAKE"] = "true"
os.environ["LATENCY_BUDGET_MS"] = "5000"
os.environ["MAX_CANDIDATES"] = "10"

from app.config import get_settings

get_settings.cache_clear()
