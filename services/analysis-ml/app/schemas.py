from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class TextType(str, Enum):
    query = "query"
    passage = "passage"


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, description="One or more texts to embed.")
    type: TextType = Field(
        default=TextType.passage,
        description="'query' applies the retrieval instruction; 'passage' embeds verbatim.",
    )


class EmbedResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model: str
    dim: int
    normalized: bool
    type: TextType
    vectors: list[list[float]]


class ModelInfo(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model: str
    dim: int
    normalized: bool
    backend: str


class Health(BaseModel):
    status: str


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int
    score: float | None = None


class NerRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, description="One or more texts to analyze.")
    types: list[str] | None = Field(
        default=None, description="Optional label filter, e.g. ['ORG','GPE','DATE']."
    )


class NerResponse(BaseModel):
    entities: list[list[Entity]]


class NerModelInfo(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model: str
    use_transformer: bool
    labels: list[str]
    default_types: list[str] | None = None
