"""The area-local failure-code registry (deliverable 10, sub-PRD D4, ADM-001)."""

from __future__ import annotations

from typing import Iterator

import pytest
from taxrag_pipeline_ingestion.adapter import (
    DuplicateFailureCodeError,
    InvalidFailureCodeError,
    RegisteredCode,
    failure_code_registry,
    register_failure_codes,
)
from taxrag_pipeline_ingestion.adapter import failures as failures_module


@pytest.fixture(autouse=True)
def _isolated_registry() -> Iterator[None]:
    """Snapshot/restore the process-global registry so these tests are order-independent.

    Without it the suite would start failing the moment `INGF-05` registers codes at import time.
    """
    snapshot = dict(failures_module._REGISTRY)
    try:
        yield
    finally:
        failures_module._REGISTRY.clear()
        failures_module._REGISTRY.update(snapshot)


def test_registration_and_lookup() -> None:
    register_failure_codes("parsing", {"PARSE_TIMEOUT": "re-run with a larger wall clock"})
    entry = failure_code_registry()["PARSE_TIMEOUT"]
    assert entry == RegisteredCode(area="parsing", operator_action="re-run with a larger wall clock")


@pytest.mark.parametrize("code", ["parse_timeout", "1BAD", "_BAD", "BAD-CODE", "", "BAD.CODE"])
def test_a_code_not_matching_the_pattern_is_rejected(code: str) -> None:
    with pytest.raises(InvalidFailureCodeError):
        register_failure_codes("parsing", {code: "do something"})


@pytest.mark.parametrize("action", ["", "   "])
def test_a_blank_operator_action_is_rejected(action: str) -> None:
    with pytest.raises(InvalidFailureCodeError):
        register_failure_codes("parsing", {"PARSE_TIMEOUT": action})


@pytest.mark.parametrize("area", ["", "  "])
def test_a_blank_area_is_rejected(area: str) -> None:
    with pytest.raises(InvalidFailureCodeError):
        register_failure_codes(area, {"PARSE_TIMEOUT": "do something"})


def test_identical_re_registration_is_idempotent() -> None:
    for _ in range(3):
        register_failure_codes("parsing", {"PARSE_TIMEOUT": "raise the wall clock"})
    assert failure_code_registry()["PARSE_TIMEOUT"].area == "parsing"


def test_a_conflicting_duplicate_names_both_areas() -> None:
    register_failure_codes("parsing", {"PARSE_TIMEOUT": "raise the wall clock"})
    with pytest.raises(DuplicateFailureCodeError) as excinfo:
        register_failure_codes("quarantine", {"PARSE_TIMEOUT": "quarantine the artifact"})
    assert "parsing" in str(excinfo.value)
    assert "quarantine" in str(excinfo.value)


def test_the_same_area_cannot_redefine_an_action() -> None:
    register_failure_codes("parsing", {"PARSE_TIMEOUT": "raise the wall clock"})
    with pytest.raises(DuplicateFailureCodeError):
        register_failure_codes("parsing", {"PARSE_TIMEOUT": "something else"})


def test_a_rejected_batch_leaves_the_registry_untouched() -> None:
    before = dict(failure_code_registry())
    with pytest.raises(InvalidFailureCodeError):
        register_failure_codes("parsing", {"GOOD_CODE": "act", "bad code": "act"})
    assert dict(failure_code_registry()) == before

    register_failure_codes("parsing", {"GOOD_CODE": "act"})
    with pytest.raises(DuplicateFailureCodeError):
        register_failure_codes("other", {"SECOND_CODE": "act", "GOOD_CODE": "clash"})
    assert "SECOND_CODE" not in failure_code_registry()


def test_the_returned_registry_cannot_be_mutated() -> None:
    register_failure_codes("parsing", {"PARSE_TIMEOUT": "raise the wall clock"})
    registry = failure_code_registry()
    with pytest.raises(TypeError):
        registry["NEW_CODE"] = RegisteredCode(area="x", operator_action="y")  # type: ignore[index]
    assert "NEW_CODE" not in failure_code_registry()
