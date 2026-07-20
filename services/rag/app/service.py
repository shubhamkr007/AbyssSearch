"""RAG orchestration: embed query -> hybrid retrieve -> ground -> generate.

Degradation ladder: hybrid -> BM25-only (no embedding) -> extractive answer
(no LLM) -> "no results". The service never raises for a normal query.
"""

from __future__ import annotations

import time

from app.clients.embed import EmbedClient
from app.clients.llm import Llm
from app.clients.retriever import Retriever
from app.prompt import SYSTEM, build_prompt
from app.schemas import AnswerRequest, AnswerResponse, Citation, Timings


class RagService:
    def __init__(
        self,
        *,
        embed: EmbedClient,
        retriever: Retriever,
        llm: Llm,
        top_k: int = 5,
        per_passage_chars: int = 1200,
        max_context_chars: int = 6000,
    ) -> None:
        self.embed = embed
        self.retriever = retriever
        self.llm = llm
        self.top_k = top_k
        self.per_passage_chars = per_passage_chars
        self.max_context_chars = max_context_chars

    def answer(self, req: AnswerRequest) -> AnswerResponse:
        t0 = time.perf_counter()
        reasons: list[str] = []
        top_k = req.top_k or self.top_k

        te = time.perf_counter()
        vector = self.embed.embed_query(req.query)
        embed_ms = int((time.perf_counter() - te) * 1000)
        if vector is None:
            reasons.append("embedding_unavailable")

        tr = time.perf_counter()
        passages = self.retriever.retrieve(
            query=req.query,
            tenant_id=req.tenant_id,
            prefix=req.prefix,
            vector=vector,
            top_k=top_k,
        )
        retrieve_ms = int((time.perf_counter() - tr) * 1000)

        citations = [
            Citation(
                n=i + 1,
                id=p.id,
                title=p.title,
                url=p.url,
                source=p.source,
                score=p.score,
                snippet=(p.body[:200] if p.body else None),
            )
            for i, p in enumerate(passages)
        ]

        if not passages:
            reasons.append("no_results")
            return AnswerResponse(
                query=req.query,
                answer="I couldn't find any relevant information for that question.",
                model=self.llm.name(),
                used_context=False,
                degraded=True,
                degraded_reasons=reasons,
                citations=[],
                timings=Timings(
                    embed_ms=embed_ms,
                    retrieve_ms=retrieve_ms,
                    total_ms=int((time.perf_counter() - t0) * 1000),
                ),
            )

        prompt = build_prompt(
            req.query, passages, self.per_passage_chars, self.max_context_chars
        )
        tl = time.perf_counter()
        text = self.llm.generate(SYSTEM, prompt)
        llm_ms = int((time.perf_counter() - tl) * 1000)

        llm_fallback = text is None
        if llm_fallback:
            reasons.append("llm_unavailable")
            top = passages[0]
            snippet = " ".join((top.body or "").split())
            if len(snippet) > 500:
                snippet = snippet[:500] + "\u2026"
            text = (
                "(Generative model unavailable - showing the most relevant source.) "
                f"{snippet} [1]"
            )

        return AnswerResponse(
            query=req.query,
            answer=text,
            model=self.llm.name(),
            used_context=True,
            degraded=len(reasons) > 0,
            degraded_reasons=reasons,
            citations=citations,
            timings=Timings(
                embed_ms=embed_ms,
                retrieve_ms=retrieve_ms,
                llm_ms=llm_ms,
                total_ms=int((time.perf_counter() - t0) * 1000),
            ),
        )

    def ready(self) -> dict[str, bool]:
        return {"retriever": self.retriever.ping(), "llm": self.llm.ping()}
