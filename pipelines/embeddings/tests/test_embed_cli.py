"""`python -m embeddings build ...` (CRPS-05 deliverable 8).

Every blocking condition must exit non-zero with a message on stderr, INCLUDING a missing or
incomplete `--runtime-pin` — that one is named explicitly by deliverable 8.

The end-to-end invocation runs in a SUBPROCESS, which is what actually proves
`python -m embeddings` resolves and that `__main__.py` is wired. It is also where the deviation
from the ticket's literal command line shows: `PYTHONPATH=pipelines/embeddings/src` is needed
because the root configuration puts only the repository root on `sys.path`, and changing that is
FND-01's file-scope. Recorded as a writeback.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from embedding_fixtures import RUNTIME_PIN_DOCUMENT, Artefacts, CorpusFixture
from embeddings.cli import main
from embeddings.emit import MANIFEST_FILENAME, VECTOR_FILENAME
from embeddings.profile import PinnedProfile
from embeddings.report import REPORT_FILENAME

SRC = Path(__file__).resolve().parents[1] / "src"


def _backend_available() -> bool:
    try:
        import numpy  # noqa: F401
        import usearch  # noqa: F401
    except ImportError:
        return False
    return True


BACKEND_AVAILABLE = _backend_available()

#: The CLI deliberately has no `--writer` seam: production callers get `UsearchIndexWriter` and
#: nothing else, so the SUCCESS paths need the real backend. The failure paths below do not — they
#: all fail before a vector is written, which is itself worth knowing.
needs_backend = pytest.mark.skipif(
    not BACKEND_AVAILABLE,
    reason=(
        "usearch/numpy are not installed; workspace-member dependencies are not installed by "
        "`uv sync --frozen` in this repository's virtual-root uv layout. FND-01/FND-02 own the fix "
        "in the root pyproject.toml / CI workflow. The CLI's argument handling, its blocking "
        "conditions and its exit codes are all asserted unguarded below; only the paths that must "
        "actually write vectors.usearch are deferred."
    ),
)


@pytest.fixture
def cli_inputs(tmp_path: Path, pinned_profile: PinnedProfile) -> dict[str, Path]:
    profile_path = tmp_path / "profile.json"
    profile_path.write_text(json.dumps(pinned_profile.to_json(), indent=2), encoding="utf-8")
    runtime_path = tmp_path / "runtime.json"
    runtime_path.write_text(json.dumps(RUNTIME_PIN_DOCUMENT, indent=2), encoding="utf-8")
    return {"profile": profile_path, "runtime": runtime_path, "out": tmp_path / "out"}


def _argv(corpus: Path, cli_inputs: dict[str, Path], *extra: str) -> list[str]:
    return [
        "build",
        "--corpus",
        str(corpus),
        "--profile",
        str(cli_inputs["profile"]),
        "--runtime-pin",
        str(cli_inputs["runtime"]),
        "--out",
        str(cli_inputs["out"]),
        *extra,
    ]


@pytest.mark.skipif(BACKEND_AVAILABLE, reason="the backend is installed, so this path cannot fire")
def test_an_absent_vector_backend_is_a_typed_blocking_error_naming_its_owner(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    """Not a silent degradation and not a second vector format: a named, blocking refusal.

    This is the mirror image of `needs_backend`: exactly one of the two runs on any machine, so the
    CLI's behaviour is asserted either way rather than going unexercised.
    """
    assert main(_argv(corpus_fixture.path, cli_inputs, "--provider", "stub")) == 1
    captured = capsys.readouterr().err
    assert "VectorBackendUnavailable" in captured
    assert "FND-01" in captured
    assert not (cli_inputs["out"] / MANIFEST_FILENAME).exists()


@needs_backend
def test_a_stub_build_succeeds_and_publishes_the_three_artifacts(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    assert main(_argv(corpus_fixture.path, cli_inputs, "--provider", "stub")) == 0
    out = cli_inputs["out"]
    for name in (MANIFEST_FILENAME, VECTOR_FILENAME, REPORT_FILENAME):
        assert (out / name).is_file()
    assert "embedded" in capsys.readouterr().out


def test_a_missing_runtime_pin_exits_non_zero(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    cli_inputs["runtime"].unlink()
    assert main(_argv(corpus_fixture.path, cli_inputs, "--provider", "stub")) == 1
    assert "MissingRuntimePin" in capsys.readouterr().err


def test_an_incomplete_runtime_pin_exits_non_zero_naming_the_field(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    document = {key: value for key, value in RUNTIME_PIN_DOCUMENT.items() if key != "pinned_by"}
    cli_inputs["runtime"].write_text(json.dumps(document), encoding="utf-8")
    assert main(_argv(corpus_fixture.path, cli_inputs, "--provider", "stub")) == 1
    captured = capsys.readouterr().err
    assert "MissingRuntimePin" in captured and "pinned_by" in captured


def test_provider_local_without_artefact_paths_exits_non_zero(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    """And emphatically does NOT fall back to the stub."""
    assert main(_argv(corpus_fixture.path, cli_inputs, "--provider", "local")) == 1
    captured = capsys.readouterr().err
    assert "ProviderUnavailable" in captured
    assert not (cli_inputs["out"] / MANIFEST_FILENAME).exists()


def test_provider_local_with_a_wrong_pin_exits_non_zero(
    corpus_fixture: CorpusFixture,
    cli_inputs: dict[str, Path],
    model_artefacts: Artefacts,
    pinned_profile: PinnedProfile,
    capsys,
) -> None:
    broken = pinned_profile.to_json()
    broken["model_artifact"]["sha256"] = "a" * 64
    cli_inputs["profile"].write_text(json.dumps(broken), encoding="utf-8")
    exit_code = main(
        _argv(
            corpus_fixture.path,
            cli_inputs,
            "--provider",
            "local",
            "--model-artefact",
            str(model_artefacts.model_path),
            "--tokenizer",
            str(model_artefacts.tokenizer_path),
        )
    )
    assert exit_code == 1
    assert "ArtefactPinMismatch" in capsys.readouterr().err


def test_an_ineligible_tier_exits_non_zero(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path], capsys
) -> None:
    exit_code = main(
        _argv(
            corpus_fixture.path,
            cli_inputs,
            "--provider",
            "stub",
            "--tiers",
            "TIER_3_METADATA_AND_ON_DEMAND",
        )
    )
    assert exit_code == 1
    assert "IneligibleTierRequested" in capsys.readouterr().err


def test_an_absent_corpus_exits_non_zero(
    tmp_path: Path, cli_inputs: dict[str, Path], capsys
) -> None:
    assert main(_argv(tmp_path / "absent.sqlite", cli_inputs, "--provider", "stub")) == 1
    assert capsys.readouterr().err.strip()


@needs_backend
def test_the_tiers_flag_selects_both_eligible_tiers(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path]
) -> None:
    from tiering import IndexTier

    assert (
        main(
            _argv(
                corpus_fixture.path,
                cli_inputs,
                "--provider",
                "stub",
                "--tiers",
                f"{IndexTier.TIER_1_FULL_SEMANTIC.value},"
                f"{IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC.value}",
            )
        )
        == 0
    )
    document = json.loads((cli_inputs["out"] / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    assert set(document["tier_selection"]["tiers"]) == {
        IndexTier.TIER_1_FULL_SEMANTIC.value,
        IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC.value,
    }


def test_python_dash_m_embeddings_is_wired_regardless_of_the_backend() -> None:
    """`__main__.py` resolves and the parser runs — asserted UNGUARDED.

    Deliverable 8's entry point must be proven to exist on every machine, not only where the vector
    backend happens to be installed; `--help` exercises the module resolution and the argparse
    surface without writing anything.
    """
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(SRC)
    completed = subprocess.run(
        [sys.executable, "-m", "embeddings", "build", "--help"],
        capture_output=True,
        text=True,
        env=environment,
    )
    assert completed.returncode == 0, completed.stderr[-3000:]
    for flag in ("--corpus", "--profile", "--runtime-pin", "--out", "--provider", "--resume", "--tiers"):
        assert flag in completed.stdout


@needs_backend
def test_python_dash_m_embeddings_resolves(
    corpus_fixture: CorpusFixture, cli_inputs: dict[str, Path]
) -> None:
    """The literal deliverable-8 entry point, in a real subprocess.

    Documents the PYTHONPATH deviation at the same time: without it the module does not resolve,
    and the root configuration that would fix it is FND-01's.
    """
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(SRC)
    completed = subprocess.run(
        [sys.executable, "-m", "embeddings", *_argv(corpus_fixture.path, cli_inputs, "--provider", "stub")],
        capture_output=True,
        text=True,
        env=environment,
    )
    assert completed.returncode == 0, completed.stderr[-3000:]
    assert (cli_inputs["out"] / MANIFEST_FILENAME).is_file()


def test_the_help_text_documents_the_provider_choice() -> None:
    from embeddings.cli import build_parser

    action = next(
        action for action in build_parser()._subparsers._group_actions[0].choices["build"]._actions
        if action.dest == "provider"
    )
    assert action.required is True
    assert action.default is None
    assert set(action.choices) == {"local", "stub"}
