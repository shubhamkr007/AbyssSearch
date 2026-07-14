from app.pipeline.ids import document_id
from app.pipeline.normalize import chunk_text


def test_document_id_is_stable():
    a = document_id("acme", "document", "k1", "Title", "Body")
    b = document_id("acme", "document", "k1", "Title", "CHANGED")
    c = document_id("acme", "document", "k1", "Other", "Other")
    assert a == b == c  # natural_key wins


def test_document_id_changes_without_natural_key():
    a = document_id("acme", "document", None, "Title", "Body")
    b = document_id("acme", "document", None, "Title", "Body2")
    assert a != b


def test_chunk_text_respects_size_and_overlap():
    text = " ".join(f"word{i}" for i in range(40))
    chunks = chunk_text(text, size=40, overlap=10)
    assert len(chunks) >= 2
    assert all(chunks)
