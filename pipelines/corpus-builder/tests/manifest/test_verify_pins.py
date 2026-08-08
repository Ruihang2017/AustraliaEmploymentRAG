"""Acceptance items 9, 10 and 12 — pinning agreement, stub sensitivity, and a visible release kind.

Each case varies EXACTLY ONE member, which is why `bundle_factory` takes the pins as parameters.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from manifest_fixtures import document_pin, embedding_manifest_fixture, profile_fixture, query_pin, runtime_pin

from manifest import verify_bundle


def _subjects(report, code: str) -> list[str]:
    return [finding.subject for finding in report.by_code(code)]


# -- DOCUMENT_EMBEDDING against embedding-manifest.json -------------------------------------------


@pytest.mark.parametrize(
    "overrides,subject",
    [
        ({"model_id": "fixture/other"}, "DOCUMENT_EMBEDDING.model_id"),
        ({"model_revision": "rev-9999999999999999"}, "DOCUMENT_EMBEDDING.model_revision"),
        ({"dimensions": 16}, "DOCUMENT_EMBEDDING.dimensions"),
        ({"normalisation": "NONE"}, "DOCUMENT_EMBEDDING.normalisation"),
        ({"model_artifact": {"sha256": "9" * 64}}, "DOCUMENT_EMBEDDING.model_artifact.sha256"),
        ({"model_artifact": {"byte_size": 2048}}, "DOCUMENT_EMBEDDING.model_artifact.byte_size"),
        ({"model_artifact": {"format": "gguf"}}, "DOCUMENT_EMBEDDING.model_artifact.format"),
        ({"tokenizer": {"id": "other-tokenizer"}}, "DOCUMENT_EMBEDDING.tokenizer.id"),
        ({"tokenizer": {"artifact_sha256": "8" * 64}}, "DOCUMENT_EMBEDDING.tokenizer.artifact_sha256"),
        ({"licence": {"identifier": "OTHER"}}, "DOCUMENT_EMBEDDING.licence.identifier"),
        ({"licence": {"attribution_required": False}}, "DOCUMENT_EMBEDDING.licence.attribution_required"),
        ({"licence": {"redistribution_permitted": True}}, "DOCUMENT_EMBEDDING.licence.redistribution_permitted"),
        ({"licence": {"url": "https://example.invalid/licence"}}, "DOCUMENT_EMBEDDING.licence.url"),
        ({"licence": {"notes": "differs"}}, "DOCUMENT_EMBEDDING.licence.notes"),
        ({"runtime": {"family": "other-runtime"}}, "runtime.family"),
        ({"runtime": {"version": "9.9.9"}}, "runtime.version"),
        ({"runtime": {"execution_providers": ["CUDA"]}}, "runtime.execution_providers"),
        ({"runtime": {"integration": {"version": "9.9.9"}}}, "runtime.integration"),
        ({"runtime": {"tokenizer_library": {"version": "9.9.9"}}}, "runtime.tokenizer_library"),
        ({"runtime": {"pinned_by": "OTHER-RECORD"}}, "runtime.pinned_by"),
    ],
    ids=lambda value: str(value)[:60],
)
def test_a_document_pin_disagreement_blocks(bundle_factory, trusted_keys, overrides, subject) -> None:
    bundle = bundle_factory(embedding_overrides=overrides)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert not report.ok
    assert subject in _subjects(report, "PIN_EMBEDDING_MANIFEST_DISAGREEMENT")


@pytest.mark.parametrize(
    "overrides,subject",
    [
        ({"profile_id": "other-profile"}, "embedding_profile.profile_id"),
        ({"quantisation": "INT8"}, "embedding_profile.quantisation"),
    ],
)
def test_an_embedding_profile_disagreement_blocks(
    bundle_factory, trusted_keys, overrides, subject
) -> None:
    report = verify_bundle(bundle_factory(embedding_overrides=overrides), public_keys=trusted_keys)
    assert subject in _subjects(report, "PIN_EMBEDDING_MANIFEST_DISAGREEMENT")
    assert not report.ok


# -- QUERY_EMBEDDING against DOCUMENT_EMBEDDING ---------------------------------------------------


@pytest.mark.parametrize(
    "field,value",
    [
        ("dimensions", 16),
        ("normalisation", "NONE"),
        ("truncation", "LEFT"),
        ("max_tokens", 256),
    ],
)
def test_a_query_representation_disagreement_blocks(
    bundle_factory, trusted_keys, field: str, value
) -> None:
    query = replace(query_pin(), **{field: value})
    if field in ("truncation", "max_tokens"):
        # keep the pin self-consistent, so the ONLY defect is the query/document divergence
        query = replace(query, tokenizer=replace(query.tokenizer, **{field: value}))
    report = verify_bundle(
        bundle_factory(local_models=(document_pin(), query)), public_keys=trusted_keys
    )
    assert f"local_models[QUERY_EMBEDDING].{field}" in _subjects(
        report, "PIN_QUERY_REPRESENTATION_DISAGREEMENT"
    )
    assert not report.ok


@pytest.mark.parametrize("field", ["id", "artifact_sha256"])
def test_a_query_tokenizer_identity_disagreement_blocks(
    bundle_factory, trusted_keys, field: str
) -> None:
    value = "other-tokenizer" if field == "id" else "7" * 64
    query = replace(query_pin(), tokenizer=replace(query_pin().tokenizer, **{field: value}))
    report = verify_bundle(
        bundle_factory(local_models=(document_pin(), query)), public_keys=trusted_keys
    )
    assert f"local_models[QUERY_EMBEDDING].tokenizer.{field}" in _subjects(
        report, "PIN_QUERY_REPRESENTATION_DISAGREEMENT"
    )


def test_a_self_inconsistent_pin_is_its_own_code(bundle_factory, trusted_keys) -> None:
    """`truncation`/`max_tokens` must match the pin's own tokenizer — a distinct defect."""
    pin = replace(document_pin(), truncation="LEFT")
    report = verify_bundle(bundle_factory(local_models=(pin,)), public_keys=trusted_keys)
    assert "local_models[DOCUMENT_EMBEDDING].truncation" in _subjects(
        report, "PIN_TOKENIZER_INCONSISTENT"
    )


def test_a_missing_document_role_blocks(bundle_factory, trusted_keys) -> None:
    report = verify_bundle(
        bundle_factory(local_models=(replace(document_pin(), role="RERANK"),)),
        public_keys=trusted_keys,
    )
    assert "PIN_MODEL_ROLE_ABSENT" in report.codes()
    assert not report.ok


# -- Stubs (deliverable 13) -----------------------------------------------------------------------


@pytest.mark.parametrize("release_kind", ["CANDIDATE", "PUBLISHED"])
def test_a_stub_pin_blocks_a_candidate_or_published_release(
    bundle_factory, trusted_keys, release_kind: str
) -> None:
    bundle = bundle_factory(
        release_kind=release_kind,
        local_models=(replace(document_pin(), model_id="stub:0001"),),
        embedding_profile=replace(profile_fixture(), model_id="stub:0001"),
        embedding_overrides={"model_id": "stub:0001"},
    )
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert all(finding.severity == "BLOCKING" for finding in report.by_code("PIN_STUB"))
    assert not report.ok


def test_a_stub_pin_is_informational_for_a_synthetic_fixture(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory(
        release_kind="SYNTHETIC_FIXTURE",
        local_models=(replace(document_pin(), model_id="stub:0001"),),
        embedding_profile=replace(profile_fixture(), model_id="stub:0001"),
        embedding_overrides={"model_id": "stub:0001"},
    )
    report = verify_bundle(bundle, public_keys=trusted_keys)
    stubs = report.by_code("PIN_STUB")
    assert stubs and all(finding.severity == "INFO" for finding in stubs)
    assert all("stub:0001" in finding.message for finding in stubs)
    assert report.ok


def test_a_stub_runtime_family_is_detected(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory(
        release_kind="SYNTHETIC_FIXTURE",
        runtime=replace(runtime_pin(), family="stub"),
        embedding_overrides={"runtime": {"family": "stub"}},
    )
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "runtime.family" in _subjects(report, "PIN_STUB")


@pytest.mark.parametrize("marker", ["stub", "STUB", " Stub:seed ", "stub:anything"])
def test_the_stub_marker_convention(marker: str) -> None:
    from manifest import is_stub

    assert is_stub(marker)


@pytest.mark.parametrize("value", ["stubborn", "a-stub", "", None, 3, "substub:1"])
def test_a_non_stub_value_is_not_treated_as_one(value) -> None:
    from manifest import is_stub

    assert not is_stub(value)


# -- release_kind is surfaced (acceptance item 12) ------------------------------------------------


@pytest.mark.parametrize("release_kind", ["CANDIDATE", "PUBLISHED", "SYNTHETIC_FIXTURE"])
def test_verify_bundle_surfaces_the_release_kind(bundle_factory, trusted_keys, release_kind: str) -> None:
    report = verify_bundle(bundle_factory(release_kind=release_kind), public_keys=trusted_keys)
    assert report.release_kind == release_kind


def test_a_synthetic_fixture_is_distinguishable_without_parsing_prose(
    bundle_factory, trusted_keys
) -> None:
    fixture = verify_bundle(
        bundle_factory(release_kind="SYNTHETIC_FIXTURE"), public_keys=trusted_keys
    )
    published = verify_bundle(bundle_factory(release_kind="PUBLISHED"), public_keys=trusted_keys)
    assert "RELEASE_KIND_SYNTHETIC_FIXTURE" in fixture.codes()
    assert "RELEASE_KIND_SYNTHETIC_FIXTURE" not in published.codes()


def test_an_absent_embedding_manifest_is_reported(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "embedding-manifest.json").unlink()
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "EMBEDDING_MANIFEST_ABSENT" in report.codes()


def test_an_invalid_embedding_manifest_is_reported(bundle_factory, trusted_keys) -> None:
    import json

    bundle = bundle_factory()
    document = json.loads((bundle / "embedding-manifest.json").read_text(encoding="utf-8"))
    del document["distance_metric"]
    (bundle / "embedding-manifest.json").write_text(json.dumps(document), encoding="utf-8")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "EMBEDDING_MANIFEST_SCHEMA_INVALID" in report.codes()


def test_an_unparseable_embedding_manifest_is_reported(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "embedding-manifest.json").write_text("{", encoding="utf-8")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "EMBEDDING_MANIFEST_UNPARSEABLE" in report.codes()


def test_the_reference_embedding_manifest_matches_the_reference_pins() -> None:
    """A guard on the fixture itself: the two must agree, or every test above tests nothing."""
    embedding = embedding_manifest_fixture()
    pin = document_pin()
    assert embedding.model_id == pin.model_id
    assert embedding.tokenizer == pin.tokenizer
    assert embedding.runtime == runtime_pin()
