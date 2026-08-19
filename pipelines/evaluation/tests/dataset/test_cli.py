"""Deliverable 14 — the CLI's subcommands, exit codes and both invocation forms.

EXIT CODE. Non-zero on any `FAIL` **or** `UNRESOLVED` (sub-PRD D11). On a correct fixture tree
`verify` therefore exits 1, because `SCHEMA_VALID` reports `JURISDICTION_VOCABULARY_UNRESOLVED`
(no canonical `Jurisdiction` family) and `GOLD_RESOLVES` reports unresolved gold (no `--release`).
The tests below assert the finding IDS behind the exit code, never the code alone.

INVOCATION. The ticket's `python -m evaluation.dataset` is not satisfiable as written (see
`cli.py`'s header and the build report's OQ-1); both shipped forms are exercised here, one of them
through a real subprocess so the self-bootstrapping script path is actually proved.
"""

from __future__ import annotations

import io
import json
import subprocess
import sys

import dataset_fixtures
import pytest
from dataset import yaml_min
from dataset.cli import main

REPO_ROOT = dataset_fixtures.REPO_ROOT
CLI_PATH = REPO_ROOT / "pipelines" / "evaluation" / "src" / "dataset" / "cli.py"
FIXTURE_RELEASE = dataset_fixtures.FIXTURE_RELEASE
FIXTURE_KEY = dataset_fixtures.FIXTURE_RELEASE_TRUSTED_KEY


def run(argv: list[str]) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    code = main(argv, stdout=out, stderr=err)
    return code, out.getvalue(), err.getvalue()


def test_verify_exits_non_zero_on_the_declared_unresolved_findings(dataset_tree) -> None:
    code, out, _err = run(["--root", str(dataset_tree()), "--format", "json", "verify"])
    payload = json.loads(out)
    assert code == 1
    assert payload["ok"] is False
    assert payload["counts"]["FAIL"] == 0
    assert payload["counts"]["UNRESOLVED"] > 0
    assert {f["check_id"] for f in payload["findings"]} == {"SCHEMA_VALID", "GOLD_RESOLVES"}


@pytest.mark.skipif(not FIXTURE_RELEASE.is_dir(), reason="the CRPS-08 fixture release is absent")
def test_verify_with_a_release_resolves_the_gold(dataset_tree) -> None:
    code, out, _err = run(
        [
            "--root",
            str(dataset_tree()),
            "--format",
            "json",
            "verify",
            "--release",
            str(FIXTURE_RELEASE),
            "--release-public-key-file",
            str(FIXTURE_KEY),
        ]
    )
    payload = json.loads(out)
    assert not [f for f in payload["findings"] if f["check_id"] == "GOLD_RESOLVES"]
    assert code == 1  # the jurisdiction UNRESOLVED still stands, and still blocks


def test_verify_fails_hard_on_a_broken_tree(dataset_tree) -> None:
    code, out, _err = run(
        ["--root", str(dataset_tree(miscount_category="federal-core")), "--format", "json", "verify"]
    )
    payload = json.loads(out)
    assert code == 1
    assert payload["counts"]["FAIL"] > 0
    assert "ALLOCATION_EXACT" in {f["check_id"] for f in payload["findings"]}


def test_verify_category_scopes_the_run(dataset_tree) -> None:
    root = dataset_tree(miscount_category="federal-core")
    _code, out, _err = run(
        ["--root", str(root), "--format", "json", "verify", "--category", "case-treatment"]
    )
    payload = json.loads(out)
    assert not [f for f in payload["findings"] if f["check_id"] == "ALLOCATION_EXACT"]


def test_guard_blind_passes_and_fails(dataset_tree) -> None:
    assert run(["--root", str(dataset_tree()), "guard-blind"])[0] == 0
    code, out, _err = run(["--root", str(dataset_tree(plaintext_under_blind="federal-core")), "guard-blind"])
    assert code == 1
    assert "BLIND_SEALED" in out


def test_hash_prints_a_digest_per_case(dataset_tree) -> None:
    code, out, _err = run(["--root", str(dataset_tree()), "--format", "json", "hash"])
    payload = json.loads(out)
    assert code == 0
    assert len(payload["cases"]) == 10
    assert all(len(row["content_sha256"]) == 64 for row in payload["cases"])
    blind_rows = [row for row in payload["cases"] if row["split"] == "BLIND"]
    assert len(blind_rows) == 3
    assert all("envelope_sha256" in row for row in blind_rows)


def test_version_new_writes_a_registry_and_repairs_a_correction(dataset_tree) -> None:
    """Ticket test-plan step 10: edit -> fails; `version new` -> passes."""
    root = dataset_tree(edit_question_of="EVAL-FED-002")
    _code, out, _err = run(["--root", str(root), "--format", "json", "verify"])
    assert "VERSIONED_CORRECTIONS" in {f["check_id"] for f in json.loads(out)["findings"]}

    code, _out, _err = run(
        ["--root", str(root), "version", "new", "--reason", "corrected after review", "--approved-by", "founder"]
    )
    assert code == 0
    written = json.loads((root / "splits" / "dataset-versions" / "v2.json").read_text(encoding="utf-8"))
    assert written["approved_by"] == "founder"
    assert written["supersedes"] == "v1"

    # The case still declares v1, and v2 now registers its current content, so the invisible-edit
    # finding is gone.
    _code, out, _err = run(["--root", str(root), "--format", "json", "verify"])
    assert "VERSIONED_CORRECTIONS" not in {f["check_id"] for f in json.loads(out)["findings"]}


def test_version_new_refuses_to_rewrite_an_existing_version(dataset_tree) -> None:
    root = dataset_tree()
    code, _out, err = run(
        [
            "--root",
            str(root),
            "version",
            "new",
            "--reason",
            "r",
            "--approved-by",
            "founder",
            "--version",
            "v1",
        ]
    )
    assert code == 2
    assert "already exists" in err


def test_migrate_writes_a_record_that_satisfies_the_check(dataset_tree) -> None:
    root = dataset_tree(edit_expected_output_of="EVAL-FED-002")
    _code, out, _err = run(["--root", str(root), "--format", "json", "verify"])
    assert any(
        "no migration record" in f["message"] for f in json.loads(out)["findings"]
    )
    code, _out, _err = run(
        [
            "--root",
            str(root),
            "migrate",
            "--from",
            "v1",
            "--to",
            "v2",
            "--reason",
            "the official source changed",
            "--approved-by",
            "founder",
            "--classification",
            "CORPUS",
            "--case",
            "EVAL-FED-002",
        ]
    )
    assert code == 0
    _code, out, _err = run(["--root", str(root), "--format", "json", "verify"])
    assert not any("no migration record" in f["message"] for f in json.loads(out)["findings"])


def test_seal_produces_an_envelope_and_a_sidecar_and_echoes_nothing(dataset_tree, tmp_path) -> None:
    root = dataset_tree()
    authoring = tmp_path / "outside-the-repository"
    authoring.mkdir()
    document = {
        "id": "EVAL-CAS-004",
        "dataset_version": "v1",
        "split": "BLIND",
        "primary_category": "case-treatment",
        "tags": ["ASK"],
        "trap_types": ["temporal"],
        "jurisdictions": ["AU"],
        "product_surface": "ASK",
        "latency_class": "STANDARD",
        "cost_class": "STANDARD",
        "author": "evaluation-author-agent",
        "reviewer": "evaluation-reviewer-agent",
        "change_reason": "initial authoring",
        "question": "a synthetic blind question that must never be echoed",
        "anonymous_scenario": "a synthetic blind scenario",
    }
    (authoring / "case.yaml").write_text(yaml_min.dump(document), encoding="utf-8")

    code, out, err = run(
        ["--root", str(root), "seal", "--category", "case-treatment", "--in", str(authoring)]
    )
    assert code == 0
    assert "must never be echoed" not in out
    assert "must never be echoed" not in err

    blind_dir = root / "cases" / "case-treatment" / "blind"
    envelope = json.loads((blind_dir / "EVAL-CAS-004.envelope.json").read_text(encoding="utf-8"))
    assert envelope["algorithm"] == "crypto_box_seal"
    sidecar = yaml_min.load_path(blind_dir / "EVAL-CAS-004.sidecar.yaml")
    assert sidecar["envelope_digest"] == envelope["ciphertext_sha256"]
    assert "question" not in sidecar, "the sidecar is an allowlist projection, not a copy"
    assert "anonymous_scenario" not in sidecar


def test_the_script_path_invocation_bootstraps_itself() -> None:
    """`uv run python pipelines/evaluation/src/dataset/cli.py …` works from the repository root."""
    completed = subprocess.run(
        [sys.executable, str(CLI_PATH), "--help"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert "guard-blind" in completed.stdout


def test_the_module_invocation_works_with_src_on_the_path() -> None:
    """`python -m dataset …` — see cli.py's header and the build report's OQ-1."""
    env = {
        "PATH": "",
        "PYTHONPATH": str(REPO_ROOT / "pipelines" / "evaluation" / "src"),
        "SYSTEMROOT": "C:\\Windows",
    }
    completed = subprocess.run(
        [sys.executable, "-m", "dataset", "--help"],
        capture_output=True,
        text=True,
        cwd=str(REPO_ROOT),
        env=env,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert "guard-blind" in completed.stdout
