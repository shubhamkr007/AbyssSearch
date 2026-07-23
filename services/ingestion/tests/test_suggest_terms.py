from app.clients.indexer import FakeIndexBackend
from app.pipeline.runner import run_pipeline, upsert_suggest_terms
from app.pipeline.suggest_terms import count_terms_from_titles, tokenize_title
from app.schemas import InlineDocument


def test_tokenize_title_drops_stopwords_and_chunk_suffix():
    assert tokenize_title("Welcome to India Office") == ["welcome", "india", "office"]
    assert tokenize_title("India Handbook (part 2)") == ["india", "handbook"]
    assert "ind" not in tokenize_title("India")  # stores full word; ES ngrams the prefix


def test_count_terms_from_titles():
    counts = count_terms_from_titles(["Welcome to India", "India Office"])
    assert counts["india"] == 2
    assert counts["welcome"] == 1
    assert "to" not in counts


def test_upsert_suggest_terms_increments_weight():
    indexer = FakeIndexBackend()
    docs = [
        {"title": "Welcome to India", "parent_id": "p1", "chunk_index": 0},
        {"title": "India Office", "parent_id": "p2", "chunk_index": 0},
    ]
    n = upsert_suggest_terms(docs, indexer, tenant_id="t1", tenant_prefix="demo")
    assert n >= 2
    bucket = indexer.suggest_docs["auto_complete-demo"]
    terms = {d["term"]: d["weight"] for d in bucket.values()}
    assert terms["india"] == 2
    assert terms["welcome"] == 1

    # Second upsert increments.
    upsert_suggest_terms(docs[:1], indexer, tenant_id="t1", tenant_prefix="demo")
    terms = {d["term"]: d["weight"] for d in bucket.values()}
    assert terms["india"] == 3


def test_run_pipeline_writes_autocomplete_terms():
    indexer = FakeIndexBackend()
    from app.clients.enrich import FakeEmbedClient, FakeNerClient

    result = run_pipeline(
        tenant_id="t1",
        tenant_prefix="demo",
        documents=[
            InlineDocument(title="Welcome to India Office", body="Body about India."),
        ],
        embed=FakeEmbedClient(),
        ner=FakeNerClient(),
        indexer=indexer,
        chunk=False,
        enrich=False,
    )
    assert result["ok"] == 1
    assert result["suggest_terms"] > 0
    terms = {d["term"] for d in indexer.suggest_docs["auto_complete-demo"].values()}
    assert "india" in terms
    assert "office" in terms
