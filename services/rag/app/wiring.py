from __future__ import annotations

from app.clients.embed import FakeEmbedClient, HttpEmbedClient
from app.clients.llm import FakeLlm, OllamaLlm
from app.clients.retriever import EsRetriever, FakeRetriever
from app.config import Settings
from app.service import RagService


def build_service(settings: Settings) -> RagService:
    if settings.use_fake:
        return RagService(
            embed=FakeEmbedClient(),
            retriever=FakeRetriever(),
            llm=FakeLlm(),
            top_k=settings.top_k,
            per_passage_chars=settings.per_passage_chars,
            max_context_chars=settings.max_context_chars,
        )

    embed = HttpEmbedClient(settings.embedding_service_url, settings.embed_timeout_ms)
    retriever = EsRetriever(
        settings.elasticsearch_url,
        settings.elasticsearch_api_key,
        settings.es_timeout_ms,
        rank_window=settings.rank_window,
        knn_k=settings.knn_k,
        knn_num_candidates=settings.knn_num_candidates,
        rrf_rank_constant=settings.rrf_rank_constant,
    )
    llm = OllamaLlm(settings.ollama_url, settings.ollama_model, settings.llm_timeout_ms)
    return RagService(
        embed=embed,
        retriever=retriever,
        llm=llm,
        top_k=settings.top_k,
        per_passage_chars=settings.per_passage_chars,
        max_context_chars=settings.max_context_chars,
    )
