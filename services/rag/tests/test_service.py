from __future__ import annotations

from app.clients.embed import FakeEmbedClient
from app.clients.llm import FakeLlm
from app.clients.retriever import FakeRetriever
from app.rrf import fuse_rrf
from app.schemas import AnswerRequest
from app.service import RagService


def make_service(**overrides) -> RagService:
    kwargs = dict(embed=FakeEmbedClient(), retriever=FakeRetriever(), llm=FakeLlm(), top_k=3)
    kwargs.update(overrides)
    return RagService(**kwargs)


def req(query: str, **kw) -> AnswerRequest:
    return AnswerRequest(query=query, tenant_id="demo", prefix="demo", **kw)


def test_rrf_fuses_by_rank():
    fused = fuse_rrf([["a", "b", "c"], ["c", "b", "d"]], rank_constant=60)
    # 'b' and 'c' appear in both legs near the top, so they rank ahead of a/d.
    assert set(fused[:2]) == {"b", "c"}


def test_answer_grounds_and_cites():
    svc = make_service()
    res = svc.answer(req("how do I get reimbursed for travel"))
    assert res.answer
    assert res.used_context is True
    assert res.degraded is False
    assert res.citations, "expected at least one citation"
    # The expense doc should be the top source for this query.
    assert res.citations[0].title == "Expense Reimbursement Policy"
    assert res.citations[0].n == 1


def test_answer_respects_top_k():
    svc = make_service(top_k=2)
    res = svc.answer(req("onboarding vpn expense"))
    assert len(res.citations) <= 2


def test_llm_fallback_is_extractive_and_degraded():
    class DeadLlm:
        def generate(self, system, prompt):
            return None

        def name(self):
            return "dead"

        def ping(self):
            return False

    svc = make_service(llm=DeadLlm())
    res = svc.answer(req("vpn remote access"))
    assert res.degraded is True
    assert "llm_unavailable" in res.degraded_reasons
    assert res.used_context is True
    assert "[1]" in res.answer  # extractive fallback still cites the top source


def test_no_results_is_graceful():
    svc = make_service(retriever=FakeRetriever(docs=[]))
    res = svc.answer(req("anything"))
    assert res.used_context is False
    assert "no_results" in res.degraded_reasons
    assert res.citations == []
