"""Every invalid fixture produces EXACTLY its expected violation code.

Exactly one code, not "at least" it: a fixture that passed on an unrelated schema error would be a
false green, and these fixtures are the artifact `INGF-01` and the five source modules assert
against.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from contracts.validate import validate_record
from contracts.violations import VIOLATION_CODES

INVALID_DIR = Path(__file__).resolve().parent / "fixtures" / "invalid"
CASES = sorted(path for path in INVALID_DIR.iterdir() if path.is_dir())

#: The invalid cases CRPS-01 deliverable 17 names by hand. A rename must not silently lose one.
REQUIRED_CASES = {
    "missing-artifact-sha256",
    "corpus-primary-key",
    "offset-overruns-text",
    "text-hash-mismatch",
    "unknown-legal-status",
}


def _node_texts(directory: Path) -> dict[tuple[str, str, str], str]:
    context_path = directory / "context.json"
    if not context_path.is_file():
        return {}
    context = json.loads(context_path.read_text(encoding="utf-8"))
    return {
        (
            entry["ref"]["stable_source_key"],
            entry["ref"]["version_label"],
            entry["ref"]["stable_node_key"],
        ): entry["canonical_text"]
        for entry in context["node_texts"]
    }


def test_the_named_invalid_cases_all_exist() -> None:
    assert REQUIRED_CASES <= {path.name for path in CASES}


@pytest.mark.parametrize("directory", CASES, ids=lambda p: p.name)
def test_invalid_fixture_produces_exactly_its_expected_code(directory: Path) -> None:
    record = json.loads((directory / "record.json").read_text(encoding="utf-8"))
    expected = json.loads((directory / "expected.json").read_text(encoding="utf-8"))["code"]
    assert expected in VIOLATION_CODES

    codes = [
        violation.code
        for violation in validate_record(record, node_texts=_node_texts(directory))
    ]
    assert codes == [expected], f"{directory.name}: expected [{expected}], got {codes}"


@pytest.mark.parametrize("directory", CASES, ids=lambda p: p.name)
def test_the_invalid_fixture_is_invalid_only_in_the_intended_way(directory: Path) -> None:
    """Repairing the single defect must make the record conform — otherwise the fixture is
    over-broken and its code assertion is accidental."""
    record = json.loads((directory / "record.json").read_text(encoding="utf-8"))
    repairs = {
        "missing-artifact-sha256": lambda r: r["provenance"].update({"artifact_sha256": "b" * 64}),
        "corpus-primary-key": lambda r: r["payload"].update({"stable_node_key": "s3"}),
        "offset-overruns-text": lambda r: r["payload"].update({"evidence_end": 12}),
        "text-hash-mismatch": lambda r: r["payload"].update(
            {"text_hash": _sha256(r["payload"]["canonical_text"])}
        ),
        "unknown-legal-status": lambda r: r["payload"].update({"legal_status": "IN_FORCE"}),
        "model-suggested-unevidenced": lambda r: r["payload"].update(
            {"confidence_state": "PARSER_DETERMINISTIC"}
        ),
        "contract-version-too-new": lambda r: r.update({"contract_version": "1.0.0"}),
    }
    assert directory.name in repairs, f"add a repair for the new fixture {directory.name}"
    repairs[directory.name](record)
    remaining = validate_record(record, node_texts=_node_texts(directory))
    assert remaining == [], [(v.code, v.message) for v in remaining]


def _sha256(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@pytest.mark.parametrize("value", [None, [], "x", 42, {"contract_version": "1.0.0"}])
def test_validate_record_never_raises_on_junk(value: object) -> None:
    """R-11: a validator that throws on bad input is useless to a quarantine pipeline."""
    violations = validate_record(value)  # type: ignore[arg-type]
    assert violations and all(violation.code in VIOLATION_CODES for violation in violations)


def test_a_non_string_record_type_is_reported_not_raised() -> None:
    record = {"contract_version": "1.0.0", "record_type": 7, "payload": {}}
    assert [v.code for v in validate_record(record)] == ["RECORD_TYPE_UNKNOWN"]
