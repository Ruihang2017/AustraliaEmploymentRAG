"""Gate 8, phase B — `verify_bundle()` over a real built bundle.

This is the AGREEMENT half of the pinning matrix: an embedding-manifest disagreement, a
QUERY/DOCUMENT representation mismatch, and stub visibility under each `release_kind`. None of it is
re-implemented in this ticket — `verify_bundle()` performs the checks and this gate maps its
findings — so the tests run whole builds and assert the mapped result.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Callable

from candidate_fixtures import Candidate, fixture_document_pin, fixture_query_pin

from build import NullLexicalIndexBuilder, assemble_bundle


def _codes(outcome) -> set[str]:  # type: ignore[no-untyped-def]
    return {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
    }


def _blocking(outcome) -> set[str]:  # type: ignore[no-untyped-def]
    return {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.severity == "BLOCKING"
    }


def test_a_good_bundle_verifies(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "BUILT", _blocking(outcome)


def test_a_document_pin_disagreeing_with_the_embedding_manifest_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """The pin says one model revision, the embedding manifest another: a consumer cannot tell
    which produced the indexed vectors."""
    candidate = candidate_factory(
        embedding_overrides={"model_revision": "rev-999999999999999999999999"}
    )
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert "PIN_EMBEDDING_MANIFEST_DISAGREEMENT" in _blocking(outcome)
    assert candidate.request().final_dir.exists() is False


def test_a_query_pin_whose_representation_differs_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    query = replace(fixture_query_pin(), dimensions=16)
    candidate = candidate_factory(model_pins=(fixture_document_pin(), query))
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert "PIN_QUERY_REPRESENTATION_DISAGREEMENT" in _blocking(outcome)


def test_a_pin_that_contradicts_its_own_tokenizer_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    pin = replace(fixture_document_pin(), max_tokens=256)
    candidate = candidate_factory(model_pins=(pin,))
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert "PIN_TOKENIZER_INCONSISTENT" in _blocking(outcome)


def test_a_synthetic_fixture_with_stub_pins_builds_and_the_stub_is_visible(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`PIN_STUB` is INFO for a SYNTHETIC_FIXTURE and BLOCKING otherwise — CRPS-02 already
    implements that rule, and this ticket uses it rather than re-implementing it."""
    stub_document = replace(
        fixture_document_pin(),
        model_id="stub:synthetic-fixture",
        model_revision="stub:no-revision",
    )
    stub_query = replace(stub_document, role="QUERY_EMBEDDING")
    candidate = candidate_factory(
        release_kind="SYNTHETIC_FIXTURE", model_pins=(stub_document, stub_query)
    )
    outcome = assemble_bundle(
        candidate.request(release_kind="SYNTHETIC_FIXTURE"),
        index_builder=NullLexicalIndexBuilder(reason="fixture"),
    )
    assert outcome.decision == "BUILT", _blocking(outcome)
    assert "PIN_STUB" in _codes(outcome)

    assert outcome.bundle_dir is not None
    manifest = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    # The stub is VISIBLE in the manifest, never disguised.
    assert manifest["local_models"][0]["model_id"] == "stub:synthetic-fixture"
    assert manifest["embedding_profile"]["model_id"] == "stub:synthetic-fixture"


def test_the_same_stub_pins_are_blocking_as_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    stub_document = replace(fixture_document_pin(), model_id="stub:synthetic-fixture")
    candidate = candidate_factory(release_kind="CANDIDATE", model_pins=(stub_document,))
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert "MANIFEST_PIN_STUB_ON_CANDIDATE" in _blocking(outcome)


def test_a_verify_bundle_warning_maps_to_an_anomaly_not_a_block(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """The committed development signer is a WARNING in CRPS-02's vocabulary, which is an ANOMALY
    in this one — the build proceeds and the fact is recorded."""
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "BUILT"
    development = [
        finding
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.code == "SIGNATURE_SIGNER_DEVELOPMENT"
    ]
    assert development and development[0].severity == "ANOMALY"
    assert development[0].evidence["severity_reported"] == "WARNING"
    assert development[0].evidence["source"] == "manifest.verify_bundle"
