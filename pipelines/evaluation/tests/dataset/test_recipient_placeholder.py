"""The committed recipient key is a placeholder, and nothing may be sealed to it.

`evals/splits/blind-recipient.pub` ships with `kind: DEVELOPMENT_PLACEHOLDER` and a scalar whose
private half is publicly derivable on purpose — that is what makes it unmistakably not a key. The
mechanism is only honest if the sealing path *refuses* it, so replacing the file stays `GOLD-01`'s
single `[human]` acceptance item rather than a comment nobody enforces (sub-PRD **D22**; breakdown
plan §8 **Q6**).

There is deliberately no override flag: a `--force` here would reintroduce exactly the accident the
refusal exists to prevent (ticket deliverable 13 — the guard fails, it never warns).
"""

from __future__ import annotations

import base64
import io
import json

import dataset_fixtures
import pytest
from dataset import blind
from dataset.cli import main

_COMMITTED_RECIPIENT = dataset_fixtures.REPO_ROOT / "evals" / "splits" / blind.RECIPIENT_FILENAME

_AUTHORED_CASE = "id: EVAL-CAS-900\nsplit: BLIND\nprimary_category: case-treatment\n"


def run(argv: list[str]) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    code = main(argv, stdout=out, stderr=err)
    return code, out.getvalue(), err.getvalue()


def test_the_committed_recipient_is_declared_a_placeholder() -> None:
    document = json.loads(_COMMITTED_RECIPIENT.read_text(encoding="utf-8"))
    assert document["kind"] == "DEVELOPMENT_PLACEHOLDER"
    assert document["algorithm"] == "crypto_box_seal"
    assert document["key_id"].startswith("dev-")


def test_loading_the_committed_recipient_refuses() -> None:
    with pytest.raises(blind.BlindRecipientKeyUnavailable):
        blind.load_recipient(_COMMITTED_RECIPIENT)


def test_the_placeholder_is_still_inspectable_when_asked_explicitly() -> None:
    key_id, public, major = blind.load_recipient(_COMMITTED_RECIPIENT, allow_placeholder=True)
    assert key_id.startswith("dev-")
    assert len(public) == 32
    assert major == 1


def test_seal_against_the_committed_placeholder_exits_non_zero_and_writes_nothing(
    dataset_tree, tmp_path
) -> None:
    root = dataset_tree()
    authoring = tmp_path / "authoring"
    authoring.mkdir()
    (authoring / "EVAL-CAS-900.yaml").write_text(_AUTHORED_CASE, encoding="utf-8")

    code, _out, err = run(
        [
            "--root",
            str(root),
            "seal",
            "--category",
            "case-treatment",
            "--in",
            str(authoring),
            "--recipient",
            str(_COMMITTED_RECIPIENT),
        ]
    )

    assert code != 0
    assert "placeholder" in err
    assert not list((root / "cases" / "case-treatment" / "blind").glob("EVAL-CAS-900*"))


def test_a_non_placeholder_recipient_still_seals(dataset_tree, tmp_path, ephemeral_recipient) -> None:
    """The refusal is keyed on the placeholder marker only, so the real sealing path stays open."""
    root = dataset_tree()
    public, _private = ephemeral_recipient
    recipient = tmp_path / "founder-recipient.pub"
    recipient.write_text(
        json.dumps(
            {
                "key_id": "blind-recipient-001",
                "algorithm": "crypto_box_seal",
                "kind": "EPHEMERAL_TEST",
                "blind_dataset_major_version": 1,
                "public_key_base64": base64.b64encode(public).decode("ascii"),
            }
        ),
        encoding="utf-8",
    )
    authoring = tmp_path / "authoring-ok"
    authoring.mkdir()
    (authoring / "EVAL-CAS-901.yaml").write_text(
        _AUTHORED_CASE.replace("900", "901"), encoding="utf-8"
    )

    code, _out, _err = run(
        [
            "--root",
            str(root),
            "seal",
            "--category",
            "case-treatment",
            "--in",
            str(authoring),
            "--recipient",
            str(recipient),
        ]
    )

    assert code == 0
    assert (root / "cases" / "case-treatment" / "blind" / "EVAL-CAS-901.envelope.json").exists()
