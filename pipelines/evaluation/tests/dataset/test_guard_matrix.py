"""Acceptance item: blind plaintext is impossible — the five-case guard matrix.

"`guard-blind` fails on (a) a plaintext case under a `blind/` path, (b) a blind case with no
envelope, (c) an envelope whose digest does not match its manifest entry, (d) a sidecar carrying any
non-allowlisted field, (e) any private-key-shaped file." (PRD §14.3, §43.1, §45.1 item 6; sub-PRD
D1-D3.)

Each row runs `guard()` — the KEY-LESS control — over a scratch copy of the fixture tree, and
asserts both that it fails and that its output names the case id and no case content.
"""

from __future__ import annotations

import dataset_fixtures  # noqa: F401
import pytest
from dataset import blind
from dataset.findings import PRIVATE_MATERIAL_CHECK_ID, Finding


def guard(root) -> list[Finding]:
    return blind.guard(root)


def test_guard_passes_on_a_correct_tree(dataset_tree) -> None:
    assert guard(dataset_tree()) == []


def test_a_plaintext_case_under_a_blind_path_fails(dataset_tree) -> None:
    found = guard(dataset_tree(plaintext_under_blind="federal-core"))
    assert any(f.check_id == "BLIND_SEALED" and "plaintext by elimination" in f.message for f in found)


def test_a_committed_authoring_draft_under_blind_unsealed_fails(dataset_tree) -> None:
    """`evals/.gitignore` names this path; the guard is what makes it a build failure."""
    found = guard(dataset_tree(unsealed_plaintext_in="federal-core"))
    assert any(f.check_id == "BLIND_SEALED" and "unsealed" in f.message for f in found)


def test_a_blind_case_with_no_envelope_fails(dataset_tree) -> None:
    found = guard(dataset_tree(drop_envelope_for="EVAL-FED-004"))
    assert any(f.case_id == "EVAL-FED-004" and "no sealed envelope" in f.message for f in found)


def test_an_envelope_whose_digest_disagrees_fails(dataset_tree) -> None:
    found = guard(dataset_tree(corrupt_envelope_for="EVAL-FED-004"))
    assert any(f.case_id == "EVAL-FED-004" and "does not match its ciphertext" in f.message for f in found)


def test_a_sidecar_with_a_non_allowlisted_field_fails(dataset_tree) -> None:
    found = guard(dataset_tree(extra_sidecar_field="EVAL-FED-004"))
    assert any(f.case_id == "EVAL-FED-004" and "non-allowlisted field" in f.message for f in found)


def test_a_sidecar_pointing_at_the_wrong_envelope_fails(dataset_tree) -> None:
    """Review finding (high): the key-less guard computed envelope digests and threw them away.

    The sidecar is the only description of a blind slot anyone without the key can read, so a
    sidecar whose `envelope_digest` does not name the envelope beside it means the metadata and the
    sealed material have come apart — a swapped, restored or hand-edited envelope. `check()` made
    this comparison for a composed dataset; `guard-blind`, the control that runs on a raw checkout
    in ordinary CI, did not, which is exactly the wrong way round.
    """
    found = guard(dataset_tree(sidecar_digest_mismatch_for="EVAL-FED-004"))
    assert any(
        f.check_id == "BLIND_SEALED"
        and f.case_id == "EVAL-FED-004"
        and "sidecar's envelope_digest does not match" in f.message
        for f in found
    )


def test_a_sidecar_with_no_envelope_digest_fails(dataset_tree) -> None:
    found = guard(dataset_tree(sidecar_without_digest_for="EVAL-FED-004"))
    assert any(
        f.case_id == "EVAL-FED-004" and "names no envelope_digest" in f.message for f in found
    )


def test_an_envelope_sealed_with_another_primitive_fails(dataset_tree) -> None:
    """Rule (e) of the module docstring — also documented but not enforced in the key-less half."""
    found = guard(dataset_tree(wrong_algorithm_for="EVAL-FED-004"))
    assert any(
        f.case_id == "EVAL-FED-004" and "envelope algorithm is not" in f.message for f in found
    )


def test_a_private_key_shaped_file_fails(dataset_tree) -> None:
    found = guard(dataset_tree(private_key_file_in="federal-core"))
    assert any(f.check_id == PRIVATE_MATERIAL_CHECK_ID for f in found)


@pytest.mark.parametrize(
    "knob",
    [
        {"plaintext_under_blind": "federal-core"},
        {"unsealed_plaintext_in": "federal-core"},
        {"drop_envelope_for": "EVAL-FED-004"},
        {"corrupt_envelope_for": "EVAL-FED-004"},
        {"extra_sidecar_field": "EVAL-FED-004"},
        {"sidecar_digest_mismatch_for": "EVAL-FED-004"},
        {"sidecar_without_digest_for": "EVAL-FED-004"},
        {"wrong_algorithm_for": "EVAL-FED-004"},
        {"private_key_file_in": "federal-core"},
    ],
)
def test_every_guard_failure_names_no_case_content(dataset_tree, knob: dict) -> None:
    """A guard that printed the plaintext it found would be the leak it exists to prevent."""
    found = guard(dataset_tree(**knob))
    assert found, knob
    for finding in found:
        rendered = finding.render()
        assert "plaintext that must never be here" not in rendered
        assert "an authoring draft that was committed" not in rendered
        assert "a field that carries content" not in rendered
        assert "not-real-material" not in rendered


def test_the_guard_needs_no_key(dataset_tree, monkeypatch) -> None:
    """The whole point: it runs in ordinary CI and in every agent session, where no key exists."""
    monkeypatch.delenv(blind.BLIND_PRIVATE_PATH_ENV, raising=False)
    assert guard(dataset_tree()) == []
