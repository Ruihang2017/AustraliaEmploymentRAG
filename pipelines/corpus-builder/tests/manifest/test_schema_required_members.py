"""Acceptance items 1 and 2 — no PRD §18.4 or Q11 member can be dropped without the schema noticing.

The member lists below are EXPLICIT LITERALS, deliberately duplicated from the ticket rather than
derived from the schema file. A test that reads the required list out of the schema it is testing
proves only that the schema agrees with itself; these lists make a relaxation of the schema a test
failure.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from manifest_fixtures import read_manifest

from contracts.jsonschema_min import Draft202012Validator
from manifest.paths import schema_documents
from manifest.verify import EMBEDDING_SCHEMA_ID, RELEASE_SCHEMA_ID

#: PRD §18.4's manifest contents plus the §35.3 columns, as the ticket's deliverable 1 table lists
#: them.
PRD_18_4_MEMBERS = (
    "manifest_version",
    "release_id",
    "release_kind",
    "parent_release_id",
    "created_at",
    "build_started_at",
    "build_finished_at",
    "versions",
    "compatibility",
    "files",
    "artifacts",
    "counts",
    "coverage",
    "quarantine",
    "evaluation",
    "embedding_profile",
    "local_models",
    "runtime",
    "signature",
    "manifest_sha256",
)

#: Breakdown plan §8 Q11 / deliverable 12, as the ticket's acceptance item 2 enumerates them.
Q11_PIN_MEMBERS = (
    ("local_models", 0, "model_revision"),
    ("local_models", 0, "model_artifact", "sha256"),
    ("local_models", 0, "dimensions"),
    ("local_models", 0, "normalisation"),
    ("local_models", 0, "truncation"),
    ("local_models", 0, "tokenizer", "artifact_sha256"),
    ("local_models", 0, "licence"),
    ("local_models", 0, "role"),
    ("local_models", 0, "model_id"),
    ("local_models", 0, "max_tokens"),
    ("local_models", 0, "bundle_path"),
    ("local_models", 0, "model_artifact", "byte_size"),
    ("local_models", 0, "model_artifact", "format"),
    ("local_models", 0, "tokenizer", "id"),
    ("local_models", 0, "tokenizer", "max_tokens"),
    ("local_models", 0, "tokenizer", "truncation"),
    ("runtime", "family"),
    ("runtime", "version"),
    ("runtime", "execution_providers"),
    ("runtime", "integration"),
    ("runtime", "tokenizer_library"),
    ("runtime", "pinned_by"),
)


def _validator(schema_id: str) -> Draft202012Validator:
    documents = schema_documents(1)
    return Draft202012Validator(documents[schema_id], documents=documents)


def _drop(document: dict[str, Any], path: tuple[Any, ...]) -> dict[str, Any]:
    copied = copy.deepcopy(document)
    target: Any = copied
    for step in path[:-1]:
        target = target[step]
    del target[path[-1]]
    return copied


def test_the_reference_manifest_is_valid(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    assert list(_validator(RELEASE_SCHEMA_ID).iter_errors(document)) == []


@pytest.mark.parametrize("member", PRD_18_4_MEMBERS)
def test_dropping_a_prd_18_4_member_fails_validation(bundle_factory, member: str) -> None:
    document = _drop(read_manifest(bundle_factory()), (member,))
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(document))
    assert any(member in error.message and error.validator == "required" for error in errors), (
        f"dropping {member!r} did not produce a `required` error naming it: "
        f"{[error.message for error in errors]}"
    )


@pytest.mark.parametrize("path", Q11_PIN_MEMBERS, ids=lambda path: ".".join(str(p) for p in path))
def test_dropping_a_q11_pin_member_fails_validation(bundle_factory, path: tuple[Any, ...]) -> None:
    document = _drop(read_manifest(bundle_factory()), path)
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(document))
    member = str(path[-1])
    assert any(member in error.message and error.validator == "required" for error in errors), (
        f"dropping {path!r} did not produce a `required` error naming {member!r}: "
        f"{[error.message for error in errors]}"
    )


def test_an_unknown_member_is_rejected(bundle_factory) -> None:
    """`additionalProperties: false` — a typo'd member must not be silently carried."""
    document = read_manifest(bundle_factory())
    document["extra_member"] = 1
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(document))
    assert any(error.validator == "additionalProperties" for error in errors)


def test_release_kind_vocabulary_is_closed(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    document["release_kind"] = "PROMOTED"
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(document))
    assert any(error.validator == "enum" for error in errors)


def test_a_float_metric_is_rejected_by_the_schema(bundle_factory) -> None:
    """§3.3 / ADR 0002: fractional values are decimal STRINGS, never JSON floats."""
    document = read_manifest(bundle_factory())
    document["evaluation"]["metrics"]["recall_at_10"] = 0.87
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(document))
    assert any(error.validator == "type" for error in errors)


EMBEDDING_MEMBERS = (
    "manifest_version",
    "profile_id",
    "model_id",
    "model_revision",
    "model_artifact",
    "licence",
    "tokenizer",
    "dimensions",
    "quantisation",
    "normalisation",
    "distance_metric",
    "runtime",
    "built_at",
    "builder_version",
    "input_contract_version",
    "tier_selection",
    "vector_file",
    "determinism",
    "source_release_id",
)


@pytest.mark.parametrize("member", EMBEDDING_MEMBERS)
def test_dropping_an_embedding_manifest_member_fails_validation(
    bundle_factory, member: str
) -> None:
    import json

    bundle = bundle_factory()
    document = json.loads((bundle / "embedding-manifest.json").read_text(encoding="utf-8"))
    del document[member]
    errors = list(_validator(EMBEDDING_SCHEMA_ID).iter_errors(document))
    assert any(member in error.message and error.validator == "required" for error in errors)
