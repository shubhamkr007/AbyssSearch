from app.clients.enrich import FakeEmbedClient, FakeNerClient
from app.clients.indexer import FakeIndexBackend
from app.pipeline.runner import run_pipeline
from app.schemas import InlineDocument


def test_run_pipeline_indexes_with_embeddings_and_entities():
    indexer = FakeIndexBackend()
    docs = [
        InlineDocument(
            title="Q1 Revenue",
            body="ACME Corp reported strong revenue in Berlin during 2026.",
            tags=["finance"],
            natural_key="q1-2026",
            source="document",
        )
    ]
    result = run_pipeline(
        tenant_id="acme-tenant",
        tenant_prefix="acme",
        documents=docs,
        embed=FakeEmbedClient(dims=8),
        ner=FakeNerClient(),
        indexer=indexer,
        chunk=False,
        enrich=True,
        ensure_index=True,
    )
    assert result["ok"] == 1
    assert result["failed"] == 0
    assert result["index"] == "acme-document"
    stored = indexer.docs[result["ids"][0]]
    assert stored["title"] == "Q1 Revenue"
    assert stored["embedding"] is not None
    assert stored["entities"]
    assert stored["tenant_id"] == "acme-tenant"


def test_chunking_produces_multiple_docs():
    indexer = FakeIndexBackend()
    long_body = ("paragraph about revenue and growth. " * 20).strip()
    docs = [InlineDocument(title="Long", body=long_body, natural_key="long-1")]
    result = run_pipeline(
        tenant_id="acme",
        tenant_prefix="acme",
        documents=docs,
        embed=FakeEmbedClient(),
        ner=FakeNerClient(),
        indexer=indexer,
        chunk=True,
        enrich=False,
        chunk_size=80,
        chunk_overlap=10,
    )
    assert result["ok"] >= 2
