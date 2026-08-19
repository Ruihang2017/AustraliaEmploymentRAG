"""The lexical index builders: the declared-absent null one, and the external one's failure modes."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from candidate_paths import SRC  # noqa: F401

from build import (
    INDEX_STATE_FILENAME,
    INDEX_VERSION_ABSENT_SENTINEL,
    IndexBuildResult,
    LexicalIndexBuilder,
    NullLexicalIndexBuilder,
)
from build.indexes import ExternalLexicalIndexBuilder, IndexBuildFailed


def test_null_builder_writes_the_ticket_s_index_state(tmp_path: Path) -> None:
    builder = NullLexicalIndexBuilder(reason="unit test")
    result = builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")

    state = json.loads((tmp_path / "tantivy" / INDEX_STATE_FILENAME).read_text(encoding="utf-8"))
    # The ticket fixes this object, and it wins over CRPS-08's committed `PLACEHOLDER` form
    # (sub-PRD D16 converges the two on this one, in a docs PR).
    assert state == {"state": "ABSENT", "reason": "unit test", "index_version": None}
    assert result.index_version is None
    assert result.file_count == 1
    assert result.byte_size > 0
    assert result.doc_count == 0
    assert result.builder_id == "null-lexical-index-builder"


def test_null_builder_satisfies_the_port() -> None:
    assert isinstance(NullLexicalIndexBuilder(), LexicalIndexBuilder)


def test_state_file_is_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "a"
    second = tmp_path / "b"
    NullLexicalIndexBuilder(reason="r").build(tmp_path / "corpus.sqlite", first)
    NullLexicalIndexBuilder(reason="r").build(tmp_path / "corpus.sqlite", second)
    assert (first / INDEX_STATE_FILENAME).read_bytes() == (second / INDEX_STATE_FILENAME).read_bytes()


def test_absent_index_version_sentinel_is_a_non_empty_string() -> None:
    """`release-manifest.schema.json` types `versions.index` as a non-empty string.

    A `null` there would fail the bundle's own verification with `MANIFEST_SCHEMA_INVALID`, which
    reads as corruption rather than as "no index was built".
    """
    assert isinstance(INDEX_VERSION_ABSENT_SENTINEL, str)
    assert INDEX_VERSION_ABSENT_SENTINEL


def _fake_command(tmp_path: Path) -> Path:
    """A file that merely EXISTS: `ExternalLexicalIndexBuilder` checks `is_file()` before running,
    and the run itself is replaced below. Executing a real cross-platform shim would test the OS's
    script association, not this module's contract."""
    command = tmp_path / "index-builder-shim"
    command.write_bytes(b"")
    return command


def _stub_run(writes: dict[str, bytes], *, stdout: str = "9.9.9\n"):
    """Stand in for `subprocess.run`: report success, and write *writes* into the `--out` directory."""

    def run(argv, **_kwargs):  # type: ignore[no-untyped-def]
        out_dir = Path(argv[argv.index("--out") + 1])
        out_dir.mkdir(parents=True, exist_ok=True)
        for name, payload in writes.items():
            (out_dir / name).write_bytes(payload)
        return subprocess.CompletedProcess(argv, 0, stdout=stdout, stderr="")

    return run


def test_an_external_builder_that_wrote_no_files_is_a_build_failure(
    tmp_path: Path, monkeypatch
) -> None:
    """REGRESSION (reviewer, HIGH). A zero exit and a plausible version string are not an index.

    Before this check the builder returned `index_version=<non-null>, file_count=0`, which gate 8
    could not distinguish from a real index (its null test keys on a null version and on the null
    builder's identity), so a CANDIDATE could be published with an empty, unusable `tantivy/`.
    """
    monkeypatch.setattr(subprocess, "run", _stub_run({}))
    builder = ExternalLexicalIndexBuilder(_fake_command(tmp_path))

    with pytest.raises(IndexBuildFailed) as error:
        builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")
    assert "empty index" in str(error.value)


def test_an_external_builder_that_wrote_only_empty_files_is_a_build_failure(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(subprocess, "run", _stub_run({"meta.json": b""}))
    builder = ExternalLexicalIndexBuilder(_fake_command(tmp_path))

    with pytest.raises(IndexBuildFailed):
        builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")


def test_an_external_builder_that_wrote_an_index_reports_the_binary_s_version(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setattr(subprocess, "run", _stub_run({"meta.json": b"{}", "0.seg": b"payload"}))
    builder = ExternalLexicalIndexBuilder(_fake_command(tmp_path))

    result = builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")
    assert result.index_version == "9.9.9"
    assert result.file_count == 2
    assert result.byte_size > 0
    assert result.builder_id == "external-lexical-index-builder"


def test_an_absent_external_command_is_a_build_failure(tmp_path: Path) -> None:
    builder = ExternalLexicalIndexBuilder(tmp_path / "not-here")
    with pytest.raises(IndexBuildFailed):
        builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")


def test_a_relative_external_command_is_refused_before_anything_runs(
    tmp_path: Path, monkeypatch
) -> None:
    """REGRESSION (reviewer, MEDIUM). The checked file and the executed binary must be the same one.

    `Path("indexer").is_file()` is resolved against the CURRENT WORKING DIRECTORY, while
    `subprocess.run(["indexer", ...], shell=False)` is resolved against `PATH` by the OS. With only
    an `is_file()` check, a bare filename could pass the existence test against a file in the cwd and
    then execute a completely different binary found on `PATH` — contradicting this module's and ADR
    0003's explicit claim that the command is never resolved from `PATH`.
    """
    invoked: list[object] = []

    def forbidden(*args, **kwargs):  # type: ignore[no-untyped-def]
        invoked.append(args)
        raise AssertionError("a relative command must never reach subprocess.run")

    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.chdir(tmp_path)
    # The file EXISTS relative to the cwd, so an `is_file()`-only check would have accepted it.
    (tmp_path / "indexer").write_bytes(b"")

    builder = ExternalLexicalIndexBuilder(Path("indexer"))
    with pytest.raises(IndexBuildFailed) as error:
        builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")

    assert "absolute path" in str(error.value)
    assert invoked == []


def test_a_relative_command_with_a_separator_is_refused_too(tmp_path: Path, monkeypatch) -> None:
    """`./indexer` and `sub/indexer` are cwd-relative as well, and a release build's cwd is not a
    stated input. Only an absolute path names one binary unambiguously."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "indexer").write_bytes(b"")

    builder = ExternalLexicalIndexBuilder(Path("sub/indexer"))
    with pytest.raises(IndexBuildFailed) as error:
        builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")
    assert "absolute path" in str(error.value)


def test_result_is_serialisable() -> None:
    result = IndexBuildResult(
        index_version="1.0.0", file_count=2, byte_size=10, doc_count=3, builder_id="x"
    )
    assert json.loads(json.dumps(result.to_dict()))["index_version"] == "1.0.0"
