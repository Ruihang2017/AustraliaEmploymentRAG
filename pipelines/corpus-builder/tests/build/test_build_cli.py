"""The CLI's exit codes, its required pin inputs, and that `python -m build` resolves."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

from candidate_fixtures import (
    Candidate,
    fixture_compatibility,
    fixture_document_pin,
    fixture_query_pin,
    fixture_runtime,
    fixture_versions,
)
from candidate_paths import DEV_PRIVATE_KEYFILE, DEV_PUBLIC_KEYFILE, DEV_SIGNER_ID, SRC

from build.cli import EXIT_INTERNAL_ERROR, EXIT_REJECTED, main


def _write_inputs(candidate: Candidate) -> dict[str, Path]:
    root = candidate.root
    versions = root / "versions.json"
    versions.write_text(json.dumps(fixture_versions().to_dict()), encoding="utf-8")
    compatibility = root / "compatibility.json"
    compatibility.write_text(json.dumps(fixture_compatibility().to_dict()), encoding="utf-8")
    pins = root / "pins.json"
    pins.write_text(
        json.dumps([fixture_document_pin().to_dict(), fixture_query_pin().to_dict()]),
        encoding="utf-8",
    )
    runtime = root / "runtime.json"
    runtime.write_text(json.dumps(fixture_runtime().to_dict()), encoding="utf-8")
    return {
        "versions": versions,
        "compatibility": compatibility,
        "pins": pins,
        "runtime": runtime,
    }


def _argv(candidate: Candidate, files: dict[str, Path], *extra: str) -> list[str]:
    return [
        "build-candidate",
        "--corpus",
        str(candidate.corpus_db),
        "--out",
        str(candidate.output_dir),
        "--release-id",
        candidate.release_id,
        "--embedding-dir",
        str(candidate.embedding_dir),
        "--versions",
        str(files["versions"]),
        "--compatibility",
        str(files["compatibility"]),
        "--embedding-profile-id",
        "fixture-embedding-profile",
        "--chunk-profile-id",
        "chunk-default-v1",
        "--model-pins",
        str(files["pins"]),
        "--runtime-pin",
        str(files["runtime"]),
        "--public-key",
        str(DEV_PUBLIC_KEYFILE),
        *extra,
    ]


def test_a_candidate_without_an_index_command_is_rejected_not_built(
    candidate_factory: Callable[..., Candidate], capsys
) -> None:
    """Without `--index-command` the null builder is used, and that is BLOCKING for a CANDIDATE."""
    candidate = candidate_factory()
    files = _write_inputs(candidate)
    code = main(
        _argv(
            candidate,
            files,
            "--evaluation-report",
            str(candidate.evaluation_report_path),
            "--sign",
            "--key",
            str(DEV_PRIVATE_KEYFILE),
            "--key-id",
            DEV_SIGNER_ID,
        )
    )
    assert code == EXIT_REJECTED
    document = json.loads(capsys.readouterr().out)
    assert document["decision"] == "REJECTED"
    assert document["bundle_dir"] is None
    assert not (candidate.output_dir / f"corpus-release-{candidate.release_id}").exists()
    report = json.loads(Path(document["gate_report"]).read_text(encoding="utf-8"))
    assert any(
        finding["code"] == "INDEX_BUILDER_NULL_ON_CANDIDATE"
        for entry in report["gates"]
        for finding in entry["findings"]
    )


def test_missing_pins_are_refused_before_any_work_happens(
    candidate_factory: Callable[..., Candidate], capsys
) -> None:
    candidate = candidate_factory()
    files = _write_inputs(candidate)
    argv = [item for item in _argv(candidate, files) if item not in {"--model-pins", str(files["pins"])}]
    code = main(argv)
    assert code == EXIT_INTERNAL_ERROR
    assert "--model-pins" in capsys.readouterr().err
    assert not candidate.output_dir.exists()


def test_a_pre_existing_final_path_is_an_internal_error_not_an_overwrite(
    candidate_factory: Callable[..., Candidate], capsys
) -> None:
    candidate = candidate_factory()
    files = _write_inputs(candidate)
    final = candidate.output_dir / f"corpus-release-{candidate.release_id}"
    final.mkdir(parents=True)
    (final / "sentinel.txt").write_text("a previous release", encoding="utf-8")

    code = main(_argv(candidate, files, "--evaluation-report", str(candidate.evaluation_report_path)))
    assert code == EXIT_INTERNAL_ERROR
    # Never overwritten, merged into, or "helpfully" deleted.
    assert (final / "sentinel.txt").read_text(encoding="utf-8") == "a previous release"
    assert "already exists" in capsys.readouterr().err


def test_a_signing_failure_exits_non_zero_and_leaves_nothing_at_the_final_path(
    candidate_factory: Callable[..., Candidate], capsys
) -> None:
    candidate = candidate_factory()
    files = _write_inputs(candidate)
    code = main(
        _argv(
            candidate,
            files,
            "--evaluation-report",
            str(candidate.evaluation_report_path),
            "--sign",
            "--key",
            str(candidate.root / "absent-key.json"),
            "--key-id",
            DEV_SIGNER_ID,
        )
    )
    assert code != 0
    capsys.readouterr()
    assert not (candidate.output_dir / f"corpus-release-{candidate.release_id}").exists()


def test_sign_requires_both_key_and_key_id(
    candidate_factory: Callable[..., Candidate], capsys
) -> None:
    candidate = candidate_factory()
    files = _write_inputs(candidate)
    code = main(_argv(candidate, files, "--sign", "--key", str(DEV_PRIVATE_KEYFILE)))
    assert code == EXIT_INTERNAL_ERROR
    assert "--key-id" in capsys.readouterr().err


def test_python_dash_m_build_resolves() -> None:
    """One subprocess test that the documented invocation actually works."""
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(SRC)
    completed = subprocess.run(
        [sys.executable, "-m", "build", "--help"],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert "build-candidate" in completed.stdout


def test_there_is_no_gate_disabling_flag() -> None:
    from build.cli import build_parser

    text = build_parser().format_help()
    for switch in ("--skip", "--force", "--only", "--no-verify", "--disable"):
        assert switch not in text, switch
