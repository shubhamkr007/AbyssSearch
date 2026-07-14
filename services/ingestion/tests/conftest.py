import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app
from app.wiring import build_orchestrator


@pytest.fixture
def settings(monkeypatch) -> Settings:
    monkeypatch.setenv("USE_FAKE", "true")
    monkeypatch.setenv("USE_INLINE", "true")
    monkeypatch.setenv("ADMIN_TOKEN", "test-admin")
    monkeypatch.setenv("MAX_BULK_BATCH", "50")
    monkeypatch.setenv("DEFAULT_CHUNK_SIZE", "50")
    monkeypatch.setenv("DEFAULT_CHUNK_OVERLAP", "10")
    get_settings.cache_clear()
    s = get_settings()
    yield s
    get_settings.cache_clear()


@pytest.fixture
def orch(settings: Settings):
    return build_orchestrator(settings)


@pytest.fixture
def client(settings: Settings):
    app = create_app()
    with TestClient(app) as c:
        yield c
