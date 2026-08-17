"""Fail-closed: a rejected build leaves NOTHING at the final path, and never touches its input.

PRD §12.2 "Failed releases MUST NOT modify active production data"; PRD §18.4; PRD §35.8 invariant 8.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Callable

from candidate_fixtures import Candidate
from candidate_paths import SRC  # noqa: F401

from build import NullLexicalIndexBuilder, assemble_bundle


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_a_rejected_build_creates_nothing_at_the_final_path_and_cleans_staging(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(omit_groups=("PT-TAS",))
    request = candidate.request()
    before = _sha256(candidate.corpus_db)

    outcome = assemble_bundle(request, index_builder=candidate.index_builder())

    assert outcome.decision == "REJECTED"
    assert outcome.exit_code == 2
    assert outcome.bundle_dir is None
    assert not request.final_dir.exists()
    assert not (request.staging_dir / request.bundle_name).exists()
    assert outcome.gate_report.staging_cleaned is True
    # The input corpus database is byte-identical: it is copied, never opened read-write.
    assert _sha256(candidate.corpus_db) == before


def test_a_rejected_build_still_writes_its_evidence(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(open_quarantine=True)
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    document = json.loads(outcome.gate_report_path.read_text(encoding="utf-8"))
    assert document["decision"] == "REJECTED"
    assert document["blocking_count"] >= 1
    assert any(
        finding["code"] == "QUARANTINE_OPEN"
        for entry in document["gates"]
        for finding in entry["findings"]
    )
    assert outcome.release_diff_path.is_file()


def test_a_candidate_built_with_the_null_index_builder_is_rejected(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE")
    request = candidate.request()
    outcome = assemble_bundle(request, index_builder=NullLexicalIndexBuilder(reason="fixture"))
    assert outcome.decision == "REJECTED"
    assert not request.final_dir.exists()
    codes = {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
    }
    assert "INDEX_BUILDER_NULL_ON_CANDIDATE" in codes


def test_an_absent_pin_is_a_gate_rejection_not_an_internal_error(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`build_release_manifest()` would raise `ManifestIncomplete` for this input."""
    candidate = candidate_factory()
    request = candidate.request(local_model_pins=(), runtime_pin=None)
    outcome = assemble_bundle(request, index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert not request.final_dir.exists()
    codes = {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
    }
    assert {"MANIFEST_PIN_RUNTIME_ABSENT", "MANIFEST_PIN_MODEL_PINS_ABSENT"} <= codes


def test_a_signing_failure_leaves_nothing_at_the_final_path(
    candidate_factory: Callable[..., Candidate], tmp_path: Path
) -> None:
    candidate = candidate_factory()
    absent_key = tmp_path / "no-such-signing-key.json"
    request = candidate.request(signing_key_path=absent_key, signing_key_id="dev-corpus-signing-001")
    outcome = assemble_bundle(request, index_builder=candidate.index_builder())

    assert outcome.decision == "REJECTED"
    assert outcome.exit_code != 0
    assert not request.final_dir.exists()
    findings = [
        finding
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.code == "MANIFEST_SIGNING_FAILED"
    ]
    assert findings and findings[0].severity == "BLOCKING"
    # No key material and no key PATH in the message (PRD §20.2).
    assert str(absent_key) not in findings[0].message
    assert "no-such-signing-key" not in json.dumps(findings[0].to_dict())


def test_an_unsigned_candidate_is_rejected_by_the_bundle_s_own_verifier(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(sign=False)
    request = candidate.request()
    outcome = assemble_bundle(request, index_builder=candidate.index_builder())
    assert outcome.decision == "REJECTED"
    assert not request.final_dir.exists()
    codes = {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
    }
    assert "SIGNATURE_ABSENT" in codes


def test_the_staging_directory_is_never_the_final_path(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    request = candidate.request()
    assert request.staging_dir not in request.final_dir.parents
    assert request.final_dir not in request.staging_dir.parents
    outcome = assemble_bundle(request, index_builder=candidate.index_builder())
    assert outcome.decision == "BUILT"
    # The staging root is removed once it is empty; nothing is left behind on the happy path.
    assert not (request.staging_dir / request.bundle_name).exists()
