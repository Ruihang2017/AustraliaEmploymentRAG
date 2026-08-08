"""CRPS-01 deliverable 16 — a reader accepts the current major and the immediately previous major."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from contracts.records import RECORD_TYPES
from contracts.validate import validate_record
from contracts.version import CONTRACT_VERSION, major_of

VALID_RUN = Path(__file__).resolve().parent / "fixtures" / "valid" / "run-001"
SCHEMA_DIR = Path(__file__).resolve().parents[2] / "schema" / "intermediate" / "v1"


def _sample() -> dict:
    line = (VALID_RUN / "document_node.jsonl").read_text(encoding="utf-8").splitlines()[0]
    return json.loads(line)


def test_the_reader_is_currently_at_major_one() -> None:
    assert major_of(CONTRACT_VERSION) == 1
    assert SCHEMA_DIR.name == "v1"


@pytest.mark.parametrize("version", ["0.9.0", "1.0.0", "1.4.0", "1.0.99", "2.0.0"])
def test_accepted_contract_versions(version: str) -> None:
    record = _sample()
    record["contract_version"] = version
    assert validate_record(record) == []


@pytest.mark.parametrize("version", ["3.0.0", "9.9.9", "4.1.2"])
def test_a_version_more_than_one_major_apart_is_rejected(version: str) -> None:
    record = _sample()
    record["contract_version"] = version
    assert [v.code for v in validate_record(record)] == ["CONTRACT_VERSION_UNSUPPORTED"]


@pytest.mark.parametrize("version", [None, "", "1.0", "v1.0.0", "1.0.0-rc1", 1])
def test_a_malformed_contract_version_is_rejected(version: object) -> None:
    record = _sample()
    record["contract_version"] = version
    assert [v.code for v in validate_record(record)] == ["CONTRACT_VERSION_UNSUPPORTED"]


def test_the_version_guard_runs_before_every_other_check() -> None:
    """A record the reader cannot parse must produce ONE finding, not a spray of derived ones."""
    record = _sample()
    record["contract_version"] = "7.0.0"
    record["payload"] = {"nonsense": True}
    del record["provenance"]
    assert [v.code for v in validate_record(record)] == ["CONTRACT_VERSION_UNSUPPORTED"]


def test_the_envelope_enum_and_the_python_registry_declare_the_same_nine_types() -> None:
    """A tenth record type cannot be added on one side only (deliverable 10 / Feedback obligation)."""
    envelope = json.loads((SCHEMA_DIR / "envelope.schema.json").read_text(encoding="utf-8"))
    assert set(envelope["properties"]["record_type"]["enum"]) == set(RECORD_TYPES)


def test_every_record_type_has_a_schema_file_on_disk() -> None:
    for record_type, (_, filename) in RECORD_TYPES.items():
        assert (SCHEMA_DIR / filename).is_file(), f"{record_type} -> {filename} is missing"
