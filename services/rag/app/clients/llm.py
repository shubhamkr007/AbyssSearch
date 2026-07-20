"""LLM client. Ollama is the default self-hosted (zero-cost) backend.

`generate` returns None on any failure so the service can degrade to an
extractive answer instead of erroring.
"""

from __future__ import annotations

from typing import Protocol

import httpx


class Llm(Protocol):
    def generate(self, system: str, prompt: str) -> str | None: ...
    def name(self) -> str: ...
    def ping(self) -> bool: ...


class OllamaLlm:
    def __init__(self, base_url: str, model: str, timeout_ms: int = 60000) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout_ms / 1000

    def generate(self, system: str, prompt: str) -> str | None:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                res = client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {"role": "user", "content": prompt},
                        ],
                        "stream": False,
                        "options": {"temperature": 0.2},
                    },
                )
                if res.status_code != 200:
                    return None
                content = (res.json().get("message") or {}).get("content")
                return content.strip() if isinstance(content, str) and content.strip() else None
        except Exception:
            return None

    def name(self) -> str:
        return f"ollama:{self.model}"

    def ping(self) -> bool:
        try:
            with httpx.Client(timeout=2.0) as client:
                return client.get(f"{self.base_url}/api/tags").status_code == 200
        except Exception:
            return False


class FakeLlm:
    def generate(self, system: str, prompt: str) -> str | None:
        return "Based on the retrieved sources, here is a grounded answer [1]."

    def name(self) -> str:
        return "fake-llm"

    def ping(self) -> bool:
        return True
