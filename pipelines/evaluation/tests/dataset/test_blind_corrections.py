"""`VERSIONED_CORRECTIONS` covers BLIND cases too — the split where an invisible edit is cheapest.

Review finding (high): the check iterated visible cases only, so a blind gold answer could be
re-sealed with different expected output and no new `dataset_version`, no `change_reason` and no
approval — PRD §14.3's "not edited invisibly" and §43.4's "may not fix a failing gold case by
changing expected output" enforced everywhere except where nobody can read the diff.

The rules exercised here, all of them KEY-LESS (none of these tests holds a private key):

* a blind case must be registered like any other;
* its sidecar METADATA must match the registry — an edit to split, class or trap types is a
  correction;
* its sealed PLAINTEXT must match the registry's keyed digest — this is the one that catches a
  re-seal of corrected content;
* a re-seal of IDENTICAL plaintext must NOT be reported: the ciphertext changes on every seal, so a
  check keyed on the ciphertext digest would cry wolf on a routine re-seal and be ignored;
* an envelope with no keyed digest is UNRESOLVED, never a pass.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import dataset_fixtures  # noqa: F401
import pytest
from dataset import blind, compose
from dataset.checks import CheckContext, run_checks
from dataset.cli import main
from dataset.findings import Finding
from dataset.model import content_sha256
from dataset.paths import SCHEMAS_DIR
from fixture_tree import FIXTURE_SALT

_CHECK = "VERSIONED_CORRECTIONS"
BLIND_CASE = "EVAL-FED-004"


def findings_for(root: Path) -> list[Finding]:
    dataset = compose(root)
    context = CheckContext(schemas_dir=SCHEMAS_DIR)
    return [f for f in run_checks(dataset, context, only=[_CHECK]) if f.check_id == _CHECK]


def for_case(root: Path, case_id: str) -> list[Finding]:
    return [f for f in findings_for(root) if f.case_id == case_id]


# -- the primitive ----------------------------------------------------------------------------------


def test_the_keyed_digest_is_stable_for_identical_plaintext() -> None:
    first = blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT)
    second = blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT)
    assert first == second == blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT)


def test_the_keyed_digest_moves_with_the_content() -> None:
    assert blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT) != blind.blind_content_digest(
        b"a sealed case.", salt=FIXTURE_SALT
    )


def test_the_keyed_digest_is_not_a_plain_hash_anyone_can_recompute() -> None:
    """Salted and keyed: the same plaintext under a different salt is a different digest.

    This is what stops the registry being a guess-confirmation oracle over blind content — a plain
    sha256 of the question would let any reader confirm a guess offline.
    """
    other = "ff" * 32
    assert blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT) != blind.blind_content_digest(
        b"a sealed case", salt=other
    )
    import hashlib

    assert blind.blind_content_digest(b"a sealed case", salt=FIXTURE_SALT) != hashlib.sha256(
        b"a sealed case"
    ).hexdigest()


@pytest.mark.parametrize("salt", ["", "abcd", "zz" * 32])
def test_a_malformed_salt_is_refused_rather_than_defaulted(salt: str) -> None:
    with pytest.raises(ValueError):
        blind.blind_content_digest(b"a sealed case", salt=salt)


# -- the check --------------------------------------------------------------------------------------


def test_a_correct_tree_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree()) == []


def test_the_registry_actually_records_a_blind_content_digest(dataset_tree) -> None:
    """If it did not, every assertion below would pass for the wrong reason."""
    root = dataset_tree()
    registry = json.loads((root / "splits" / "dataset-versions" / "v1.json").read_text(encoding="utf-8"))
    assert registry["content_hash_salt"] == FIXTURE_SALT
    rows = {row["id"]: row for row in registry["cases"]}
    assert rows[BLIND_CASE]["blind_content_sha256"]
    assert rows[BLIND_CASE]["blind_content_sha256"] != rows[BLIND_CASE]["envelope_sha256"]


def test_a_reseal_of_identical_plaintext_is_not_a_correction(dataset_tree) -> None:
    root = dataset_tree(reseal_blind_for=BLIND_CASE)
    envelope = json.loads(
        (root / "cases" / "federal-core" / "blind" / f"{BLIND_CASE}.envelope.json").read_text(encoding="utf-8")
    )
    registry = json.loads((root / "splits" / "dataset-versions" / "v1.json").read_text(encoding="utf-8"))
    row = {entry["id"]: entry for entry in registry["cases"]}[BLIND_CASE]
    assert envelope["ciphertext_sha256"] != row["envelope_sha256"], "the re-seal must really differ"
    assert envelope["blind_content_sha256"] == row["blind_content_sha256"]
    assert findings_for(root) == []


def test_a_reseal_of_corrected_plaintext_fails(dataset_tree) -> None:
    found = for_case(dataset_tree(edit_blind_plaintext_of=BLIND_CASE), BLIND_CASE)
    assert [f.severity for f in found] == ["FAIL"]
    assert "sealed plaintext differs" in found[0].message


def test_an_edited_blind_sidecar_fails(dataset_tree) -> None:
    found = for_case(dataset_tree(edit_blind_sidecar_of=BLIND_CASE), BLIND_CASE)
    assert any(f.severity == "FAIL" and "sidecar metadata differs" in f.message for f in found)


def test_an_unregistered_blind_case_fails(dataset_tree) -> None:
    found = for_case(dataset_tree(register_version=False), BLIND_CASE)
    # With no registry at all the check returns early for every case, visible or blind; the
    # meaningful assertion is the one below, where a registry exists but omits this case.
    assert found == []

    root = dataset_tree()
    path = root / "splits" / "dataset-versions" / "v1.json"
    registry = json.loads(path.read_text(encoding="utf-8"))
    registry["cases"] = [row for row in registry["cases"] if row["id"] != BLIND_CASE]
    path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    found = for_case(root, BLIND_CASE)
    assert any(f.severity == "FAIL" and "not registered" in f.message for f in found)


def test_an_envelope_with_no_keyed_digest_is_unresolved_never_a_pass(dataset_tree) -> None:
    found = for_case(dataset_tree(unsalted_blind_seal_for=BLIND_CASE), BLIND_CASE)
    assert [f.severity for f in found] == ["UNRESOLVED"]
    assert "BLIND_CONTENT_IDENTITY_UNRECORDED" in found[0].message


def test_a_versioned_blind_correction_still_needs_a_migration_record(dataset_tree) -> None:
    found = for_case(dataset_tree(blind_correction_of=BLIND_CASE), BLIND_CASE)
    assert any(f.severity == "FAIL" and "no migration record" in f.message for f in found)
    assert not any("change_reason" in f.message for f in found), (
        "the fixture supplies a change_reason, so only the migration rule may be outstanding"
    )


def test_the_sidecar_digest_ignores_the_envelope_digest(dataset_tree) -> None:
    """The metadata identity must not move when only the ciphertext does."""
    root = dataset_tree()
    dataset = compose(root)
    sidecar = next(s for entry in dataset.categories for s in entry.sidecars if s.id == BLIND_CASE)
    whole = content_sha256(sidecar.raw)
    assert sidecar.content_sha256() != whole
    mutated = dict(sidecar.raw)
    mutated["envelope_digest"] = "0" * 64
    assert content_sha256({k: v for k, v in mutated.items() if k != "envelope_digest"}) == sidecar.content_sha256()


# -- the findings stay content-free -----------------------------------------------------------------


def test_no_blind_finding_carries_anything_but_ids(dataset_tree) -> None:
    for knob in ("edit_blind_plaintext_of", "edit_blind_sidecar_of", "unsalted_blind_seal_for"):
        root = dataset_tree(**{knob: BLIND_CASE})
        for finding in findings_for(root):
            rendered = finding.render()
            assert "blind question" not in rendered.lower()
            assert "blind claim" not in rendered.lower()
            assert "scenario" not in rendered.lower()


# -- the CLI refuses to seal without a salt ----------------------------------------------------------


def test_seal_refuses_when_the_registry_records_no_salt(dataset_tree, tmp_path) -> None:
    """A sealing path that produced envelopes with no content identity would make the whole rule
    above unenforceable, so the refusal is part of the mechanism, not a nicety."""
    root = dataset_tree()
    path = root / "splits" / "dataset-versions" / "v1.json"
    registry = json.loads(path.read_text(encoding="utf-8"))
    del registry["content_hash_salt"]
    path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

    inbox = tmp_path / "authoring"
    inbox.mkdir()
    out, err = io.StringIO(), io.StringIO()
    code = main(
        [
            "--root",
            str(root),
            "seal",
            "--category",
            "federal-core",
            "--in",
            str(inbox),
            "--sealer",
            "evaluation-author-agent",
            "--recipient",
            str(root / "splits" / blind.RECIPIENT_FILENAME),
        ],
        stdout=out,
        stderr=err,
    )
    assert code == 2
    assert "content_hash_salt" in err.getvalue()
