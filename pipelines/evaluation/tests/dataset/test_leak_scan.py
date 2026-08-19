"""Acceptance item: leak detection works.

"`assert_no_blind_leakage` detects a 12-token shingle of blind plaintext written into a JSON
artifact, deletes the artifact and raises." (Sub-PRD D20.)

The deletion is asserted to have ALREADY HAPPENED when the exception is observed. A control that
raised and left the file behind would leave the leak on disk, which is the failure it exists to
prevent.
"""

from __future__ import annotations

import json

import dataset_fixtures  # noqa: F401
import pytest
from dataset.blind import (
    SHINGLE_LENGTH,
    BlindLeakDetected,
    SealedCase,
    assert_no_blind_leakage,
    leak_shingles,
)

_PLAINTEXT = (
    "does the invented casual employee accrue paid annual leave under the invented enterprise "
    "agreement when the roster changed mid fortnight"
)


@pytest.fixture()
def shingles() -> frozenset[str]:
    return leak_shingles([SealedCase("EVAL-FED-004", _PLAINTEXT.encode("utf-8"))])


def test_shingles_are_twelve_tokens_long(shingles: frozenset[str]) -> None:
    assert shingles
    assert all(len(entry.split(" ")) == SHINGLE_LENGTH for entry in shingles)


def test_a_short_plaintext_produces_no_shingle() -> None:
    assert leak_shingles([SealedCase("EVAL-FED-004", b"too short")]) == frozenset()


def test_a_clean_artifact_survives(tmp_path, shingles: frozenset[str]) -> None:
    artifact = tmp_path / "report.json"
    artifact.write_text(json.dumps({"case_id": "EVAL-FED-004", "recall_at_10": 0.91}), encoding="utf-8")
    assert_no_blind_leakage([artifact], shingles)
    assert artifact.is_file()


def test_a_leaking_artifact_is_deleted_and_the_raise_names_only_the_path(
    tmp_path, shingles: frozenset[str]
) -> None:
    artifact = tmp_path / "report.json"
    artifact.write_text(json.dumps({"debug": _PLAINTEXT}), encoding="utf-8")
    with pytest.raises(BlindLeakDetected) as raised:
        assert_no_blind_leakage([artifact], shingles)
    assert not artifact.exists(), "the artifact must be deleted BEFORE the raise is observed"
    message = str(raised.value)
    assert "deleted" in message
    assert "annual leave" not in message, "the raise must not quote the leaked text"


def test_detection_survives_case_punctuation_and_whitespace_changes(
    tmp_path, shingles: frozenset[str]
) -> None:
    """Normalisation is what makes this a leak check and not a substring check."""
    artifact = tmp_path / "report.txt"
    mangled = "  DOES the INVENTED casual employee, accrue!! paid ANNUAL leave under the invented enterprise agreement  "
    artifact.write_text(mangled, encoding="utf-8")
    with pytest.raises(BlindLeakDetected):
        assert_no_blind_leakage([artifact], shingles)
    assert not artifact.exists()


def test_an_absent_path_is_not_an_error(tmp_path, shingles: frozenset[str]) -> None:
    assert_no_blind_leakage([tmp_path / "never-written.json"], shingles)


def test_no_shingles_means_nothing_is_scanned(tmp_path) -> None:
    artifact = tmp_path / "report.json"
    artifact.write_text(_PLAINTEXT, encoding="utf-8")
    assert_no_blind_leakage([artifact], frozenset())
    assert artifact.is_file()
