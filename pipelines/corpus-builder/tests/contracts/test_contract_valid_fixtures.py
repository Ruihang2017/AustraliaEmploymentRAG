"""The committed valid run conforms, in full, through `validate_record()` and `read_run()`."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from contracts.io import MANIFEST_NAME, read_run
from contracts.records import RECORD_TYPES
from contracts.version import CONTRACT_VERSION

VALID_RUN = Path(__file__).resolve().parent / "fixtures" / "valid" / "run-001"


def test_the_run_reads_back_with_no_violations() -> None:
    run = read_run(VALID_RUN)
    assert run.violations == (), [
        (violation.code, violation.pointer, violation.message) for violation in run.violations
    ]
    assert run.ok
    assert run.contract_version == CONTRACT_VERSION


def test_the_run_covers_every_record_type() -> None:
    run = read_run(VALID_RUN)
    assert {record.record_type for record in run.records} == set(RECORD_TYPES)


def test_the_run_holds_two_versions_of_one_document_at_different_effective_from() -> None:
    """CRPS-01 deliverable 17 — the temporal case the corpus must be able to represent."""
    versions = [
        record.payload
        for record in read_run(VALID_RUN).records
        if record.record_type == "document_version"
    ]
    assert len(versions) == 2
    assert len({payload["stable_source_key"] for payload in versions}) == 1
    assert len({payload["effective_from"] for payload in versions}) == 2
    assert {payload["legal_status"] for payload in versions} == {"SUPERSEDED", "IN_FORCE"}


def test_the_run_holds_a_model_suggested_relation() -> None:
    relations = [
        record.payload
        for record in read_run(VALID_RUN).records
        if record.record_type == "node_relation"
    ]
    suggested = [item for item in relations if item["confidence_state"] == "MODEL_SUGGESTED"]
    assert suggested, "deliverable 17 requires a MODEL_SUGGESTED relation in the valid run"
    # PRD §35.2: it may exist, but only as evidenced text it can be checked against.
    for relation in suggested:
        assert relation["evidence_ref"] and relation["evidence_start"] is not None


def test_every_record_carries_full_provenance() -> None:
    for record in read_run(VALID_RUN).records:
        assert set(record.provenance) == {"official_url", "artifact_sha256", "retrieved_at"}
        assert all(str(value).strip() for value in record.provenance.values())


def _strings(value: object):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def test_no_payload_carries_a_corpus_identifier() -> None:
    from contracts.validate import CORPUS_ID_PATTERN

    for record in read_run(VALID_RUN).records:
        for text in _strings(record.payload):
            assert not CORPUS_ID_PATTERN.match(text), (
                f"{record.record_type} payload carries corpus id {text!r}"
            )
    # The envelope, by contrast, is where corpus scope legitimately lives.
    sample = read_run(VALID_RUN).records[0]
    assert CORPUS_ID_PATTERN.match(sample.source_id)


def test_typed_payload_objects_round_trip() -> None:
    for record in read_run(VALID_RUN).records:
        typed = record.payload_object()
        assert typed.to_json() == record.payload


def test_the_manifest_lists_every_file_sorted_with_relative_posix_paths() -> None:
    manifest = json.loads((VALID_RUN / MANIFEST_NAME).read_text(encoding="utf-8"))
    assert manifest["contract_version"] == CONTRACT_VERSION
    types = [entry["record_type"] for entry in manifest["files"]]
    assert types == sorted(types)
    for entry in manifest["files"]:
        assert entry["path"] == f"{entry['record_type']}.jsonl"
        assert "\\" not in entry["path"] and not Path(entry["path"]).is_absolute()
    assert {entry["record_type"] for entry in manifest["files"]} == set(RECORD_TYPES)


@pytest.mark.parametrize("path", sorted(VALID_RUN.glob("*.jsonl")), ids=lambda p: p.name)
def test_every_fixture_file_is_lf_terminated_utf8(path: Path) -> None:
    raw = path.read_bytes()
    assert b"\r" not in raw, f"{path.name} has CR bytes; the contract requires LF"
    assert raw.endswith(b"\n")
    raw.decode("utf-8")
