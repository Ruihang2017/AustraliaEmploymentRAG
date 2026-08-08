"""Acceptance item 15 — the cross-module golden reference validates, verifies and re-hashes.

This is the artifact `RETR-01` (Rust) and `RLSE-07` copy. If a re-implementation reproduces the
recorded `manifest_sha256` from the same bytes and accepts the same signature, it agrees with this
contract; if it does not, one of the two is wrong and this fixture says which bytes to compare.
"""

from __future__ import annotations

import json
from pathlib import Path

from manifest_fixtures import FIXTURES, PUBLIC_KEYFILE

from contracts.jsonschema_min import Draft202012Validator
from manifest import (
    EmbeddingManifest,
    ReleaseManifest,
    canonical_bytes,
    manifest_sha256,
    public_keys_from,
    verify_signature,
)
from manifest.paths import schema_documents
from manifest.verify import EMBEDDING_SCHEMA_ID, RELEASE_SCHEMA_ID

GOLDEN = FIXTURES / "golden"


def _load(name: str) -> dict:
    return json.loads((GOLDEN / name).read_text(encoding="utf-8"))


def _validator(schema_id: str) -> Draft202012Validator:
    documents = schema_documents(1)
    return Draft202012Validator(documents[schema_id], documents=documents)


def test_the_golden_release_manifest_validates() -> None:
    errors = list(_validator(RELEASE_SCHEMA_ID).iter_errors(_load("release-manifest.json")))
    assert errors == [], [error.message for error in errors]


def test_the_golden_embedding_manifest_validates() -> None:
    errors = list(_validator(EMBEDDING_SCHEMA_ID).iter_errors(_load("embedding-manifest.json")))
    assert errors == [], [error.message for error in errors]


def test_the_recorded_digest_reproduces_from_the_canonical_bytes() -> None:
    document = _load("release-manifest.json")
    assert manifest_sha256(document) == document["manifest_sha256"]


def test_the_signature_verifies_with_the_committed_development_public_key() -> None:
    document = _load("release-manifest.json")
    findings = verify_signature(
        document,
        public_keys=public_keys_from(PUBLIC_KEYFILE),
        release_kind=document["release_kind"],
    )
    assert [finding.code for finding in findings] == ["SIGNATURE_SIGNER_DEVELOPMENT"]
    assert findings[0].severity == "INFO"  # it IS a SYNTHETIC_FIXTURE, so this is expected


def test_the_golden_manifest_is_marked_as_a_fixture_and_a_development_signature() -> None:
    document = _load("release-manifest.json")
    assert document["release_kind"] == "SYNTHETIC_FIXTURE"
    assert document["signature"]["key_id"].startswith("dev-")


def test_the_golden_manifest_round_trips_through_the_dataclasses() -> None:
    document = _load("release-manifest.json")
    assert ReleaseManifest.from_dict(document).to_dict() == document
    embedding = _load("embedding-manifest.json")
    assert EmbeddingManifest.from_dict(embedding).to_dict() == embedding


def test_the_canonical_bytes_exclude_the_two_members(tmp_path: Path) -> None:
    """State it against the golden artifact too: a re-implementer reads THIS, not the code."""
    canonical = canonical_bytes(_load("release-manifest.json")).decode("utf-8")
    assert '"signature"' not in canonical
    assert '"manifest_sha256"' not in canonical
    assert canonical.startswith('{"artifacts":')


def test_the_golden_pins_agree_with_the_golden_embedding_manifest() -> None:
    release = _load("release-manifest.json")
    embedding = _load("embedding-manifest.json")
    document_pin = next(
        pin for pin in release["local_models"] if pin["role"] == "DOCUMENT_EMBEDDING"
    )
    for member in ("model_id", "model_revision", "dimensions", "normalisation"):
        assert document_pin[member] == embedding[member]
    assert document_pin["model_artifact"] == embedding["model_artifact"]
    assert document_pin["tokenizer"] == embedding["tokenizer"]
    assert document_pin["licence"] == embedding["licence"]
    assert release["runtime"] == embedding["runtime"]


def test_the_regenerate_helper_is_committed_next_to_the_fixture() -> None:
    assert (GOLDEN / "regenerate.py").is_file()
    assert (GOLDEN / "README.md").is_file()
