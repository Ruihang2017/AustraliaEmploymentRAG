"""Dataclass round-trips, and the closed finding table.

The finding table is closed on purpose (see `findings.py`). Two things must hold: every code the
suite can emit is IN the table, and every code in the table is exercised SOMEWHERE — a code nothing
emits is documentation pretending to be a check.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from manifest_fixtures import (
    compatibility_fixture,
    counts_fixture,
    coverage_fixture,
    document_pin,
    embedding_manifest_fixture,
    evaluation_fixture,
    licence_fixture,
    profile_fixture,
    read_manifest,
    runtime_pin,
    tokenizer_fixture,
    versions_fixture,
)

from manifest import (
    FINDING_CODES,
    CompatibilityRanges,
    Counts,
    CoverageEntry,
    EmbeddingManifest,
    EmbeddingProfileRef,
    EvaluationSummary,
    Finding,
    Licence,
    ModelPin,
    QuarantineSummary,
    ReleaseManifest,
    RuntimePin,
    Tokenizer,
    VerificationReport,
    Versions,
    write_manifest,
)

ROUND_TRIPPERS = [
    (Licence, licence_fixture()),
    (Tokenizer, tokenizer_fixture()),
    (ModelPin, document_pin()),
    (RuntimePin, runtime_pin()),
    (Versions, versions_fixture()),
    (CompatibilityRanges, compatibility_fixture()),
    (Counts, counts_fixture()),
    (CoverageEntry, coverage_fixture()[0]),
    (EvaluationSummary, evaluation_fixture()),
    (EmbeddingProfileRef, profile_fixture()),
    (EmbeddingManifest, embedding_manifest_fixture()),
    (QuarantineSummary, QuarantineSummary(open_count=1, resolved_count=2, by_reason_code={"X": 3})),
]


@pytest.mark.parametrize("cls,value", ROUND_TRIPPERS, ids=lambda item: getattr(item, "__name__", ""))
def test_from_dict_of_to_dict_is_the_identity(cls, value) -> None:
    assert cls.from_dict(value.to_dict()) == value


def test_the_release_manifest_round_trips(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    assert ReleaseManifest.from_dict(document).to_dict() == document


def test_from_dict_names_the_absent_member() -> None:
    from manifest import ManifestIncomplete

    payload = licence_fixture().to_dict()
    del payload["attribution_required"]
    with pytest.raises(ManifestIncomplete) as error:
        Licence.from_dict(payload)
    assert "licence.attribution_required" in str(error.value)


def test_to_json_bytes_is_deterministic_utf8_lf(bundle_factory) -> None:
    manifest = ReleaseManifest.from_dict(read_manifest(bundle_factory()))
    raw = manifest.to_json_bytes()
    assert raw == manifest.to_json_bytes()
    assert raw.endswith(b"\n") and b"\r\n" not in raw
    assert json.loads(raw.decode("utf-8")) == manifest.to_dict()


def test_write_manifest_is_atomic_and_leaves_no_partial_file(bundle_factory, tmp_path: Path) -> None:
    manifest = ReleaseManifest.from_dict(read_manifest(bundle_factory()))
    target = tmp_path / "nested" / "release-manifest.json"
    write_manifest(manifest, target)
    assert target.is_file()
    assert list(target.parent.iterdir()) == [target]
    write_manifest(manifest, target)  # overwriting an existing file is fine
    assert json.loads(target.read_text(encoding="utf-8"))["release_id"] == manifest.release_id


# -- the closed finding table ---------------------------------------------------------------------


def test_an_undocumented_code_cannot_be_constructed() -> None:
    with pytest.raises(ValueError) as error:
        Finding("MADE_UP_CODE", "BLOCKING", "m", "s")
    assert "closed finding table" in str(error.value)


def test_an_invalid_severity_cannot_be_constructed() -> None:
    with pytest.raises(ValueError):
        Finding("SIGNATURE_ABSENT", "CRITICAL", "m", "s")


def test_ok_keys_on_blocking_only() -> None:
    info = Finding("RELEASE_KIND_SYNTHETIC_FIXTURE", "INFO", "m", "s")
    warning = Finding("SIGNATURE_SIGNER_DEVELOPMENT", "WARNING", "m", "s")
    blocking = Finding("SIGNATURE_ABSENT", "BLOCKING", "m", "s")
    assert VerificationReport((info, warning), None, None).ok
    assert not VerificationReport((info, blocking), None, None).ok


def test_by_code_and_codes_agree() -> None:
    findings = (
        Finding("SIGNATURE_ABSENT", "BLOCKING", "m", "a"),
        Finding("SIGNATURE_ABSENT", "BLOCKING", "m", "b"),
        Finding("MANIFEST_ABSENT", "BLOCKING", "m", "c"),
    )
    report = VerificationReport(findings, None, None)
    assert report.codes() == ("SIGNATURE_ABSENT", "SIGNATURE_ABSENT", "MANIFEST_ABSENT")
    assert len(report.by_code("SIGNATURE_ABSENT")) == 2
    assert len(report.blocking()) == 3


def test_every_documented_code_is_emitted_somewhere_in_the_source() -> None:
    """A code nothing can emit is documentation pretending to be a check."""
    source = ""
    directory = Path(__file__).resolve().parents[2] / "src" / "manifest"
    for path in sorted(directory.glob("*.py")):
        if path.name == "findings.py":
            continue
        source += path.read_text(encoding="utf-8")
    unemitted = sorted(code for code in FINDING_CODES if f'"{code}"' not in source)
    assert unemitted == [], unemitted


def test_no_finding_code_looks_like_a_credential_name() -> None:
    """The repository-wide secret scan reads this module's source; ALL-CAPS `_KEY_` would trip it."""
    import re

    pattern = re.compile(r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|PASSWORD)(?:_[A-Z0-9]+)*\b")
    offenders = [code for code in FINDING_CODES if pattern.search(code)]
    assert offenders == [], offenders


def test_no_finding_message_can_carry_key_material(bundle_factory, trusted_keys) -> None:
    """PRD §20.2: key material never reaches a message, a finding or a log."""
    import base64

    from manifest import verify_bundle

    seed = base64.b64decode(
        json.loads(
            (Path(__file__).resolve().parent / "fixtures" / "keys" / "dev-corpus-signing-001.private.json")
            .read_text(encoding="utf-8")
        )["seed_b64"]
    )
    report = verify_bundle(bundle_factory(), public_keys=trusted_keys)
    blob = " ".join(f"{finding.message} {finding.subject}" for finding in report.findings)
    assert seed.hex() not in blob
    assert base64.b64encode(seed).decode("ascii") not in blob


def test_the_suite_never_leaks_a_signing_path_into_the_environment() -> None:
    from manifest.signing import SIGNING_KEYFILE_ENV

    assert SIGNING_KEYFILE_ENV not in os.environ
