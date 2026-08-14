"""The regeneration CLI (deliverable 8) — the one destructive entry point, and its guards.

`cli.py regenerate` is what the ticket, the fixture README and every future consumer are told to
run, and it takes an arbitrary `--out` path whose contents it replaces. It previously had no test at
all and deleted its target unconditionally, so a mistyped path destroyed an unrelated tree and two
concurrent runs computed the same fixed staging path and could delete each other's in-flight build.

These are regression tests for both. The refusal cases assert not only the exit code but that the
directory the command refused is still there with its bytes unchanged — an exit code alone would
still pass if the tree had already been deleted.

Everything here runs in `tmp_path`. Nothing writes to the committed bundle: the tests that must
observe the real artifact read it, and the one round-trip case COPIES it first.
"""

from __future__ import annotations

import json
import shutil
import threading
from pathlib import Path

import pytest

# `fixture_release_helpers` puts CRPS-01's `src` and this module's `fixtures/` on `sys.path`.
from fixture_release_helpers import (
    COMMITTED_BUNDLE_DIR,
    SEED_DEFAULT,
    bundle_file_map,
    committed_build_timestamp,
)

from generator import cli  # noqa: E402


def _tree_snapshot(root: Path) -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _regenerate(out_dir: Path, *, now: bool = False) -> int:
    """Drive the real `main()` argument surface, not the inner function."""
    argv = ["regenerate", "--out", str(out_dir), "--seed", str(SEED_DEFAULT)]
    if now:
        argv.append("--now")
    return cli.main(argv)


# ==================================================================================================
# The happy paths
# ==================================================================================================


def test_regenerating_into_an_absent_directory_builds_a_verified_bundle(tmp_path: Path) -> None:
    target = tmp_path / "fresh" / "corpus-release-fixture-v1"

    assert _regenerate(target, now=True) == 0

    manifest = json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
    assert manifest["release_kind"] == "SYNTHETIC_FIXTURE"
    assert manifest["signature"]["key_id"].startswith("dev-")
    assert sorted(path.name for path in target.iterdir()) == [
        "corpus.sqlite",
        "embedding-manifest.json",
        "release-manifest.json",
        "tantivy",
        "vectors.usearch",
    ]


def test_regenerating_into_an_empty_directory_is_allowed(tmp_path: Path) -> None:
    target = tmp_path / "empty"
    target.mkdir()

    assert _regenerate(target, now=True) == 0
    assert (target / "release-manifest.json").is_file()


def test_regenerating_over_a_copy_of_the_committed_bundle_reproduces_it(tmp_path: Path) -> None:
    """The deliverable-8 promise — rebuilding in place leaves the bytes alone — through the CLI.

    Run against a COPY: the committed artifact is signed and must not be rewritten by a test.
    """
    target = tmp_path / "corpus-release-fixture-v1"
    shutil.copytree(COMMITTED_BUNDLE_DIR, target)
    before = bundle_file_map(target)
    assert before == bundle_file_map(COMMITTED_BUNDLE_DIR), "the copy is not the committed bundle"

    assert _regenerate(target) == 0

    assert bundle_file_map(target) == before, (
        "regenerating in place changed the bundle: `git status` would not be clean"
    )


def test_a_successful_run_leaves_no_staging_residue(tmp_path: Path) -> None:
    """A leftover scratch directory beside the committed bundle would dirty the tree."""
    target = tmp_path / "nested" / "corpus-release-fixture-v1"

    assert _regenerate(target, now=True) == 0
    assert sorted(path.name for path in target.parent.iterdir()) == ["corpus-release-fixture-v1"]


# ==================================================================================================
# The guard — a mistyped `--out` must not be able to delete anything
# ==================================================================================================


def test_it_refuses_a_populated_directory_that_is_not_a_bundle_and_deletes_nothing(
    tmp_path: Path,
) -> None:
    """The regression this guard exists for: `--out ~/work` used to rmtree `~/work`."""
    target = tmp_path / "someone-elses-work"
    (target / "src").mkdir(parents=True)
    (target / "src" / "main.py").write_text("print('important')\n", encoding="utf-8")
    (target / "notes.md").write_text("# do not delete\n", encoding="utf-8")
    before = _tree_snapshot(target)

    assert _regenerate(target) == 2
    assert _tree_snapshot(target) == before, "the refused directory was modified"


def test_it_refuses_a_file(tmp_path: Path) -> None:
    target = tmp_path / "not-a-directory.txt"
    target.write_text("payload\n", encoding="utf-8")

    assert _regenerate(target) == 2
    assert target.read_text(encoding="utf-8") == "payload\n"


def test_it_refuses_a_directory_holding_an_unparseable_release_manifest(tmp_path: Path) -> None:
    target = tmp_path / "half-written"
    target.mkdir()
    (target / "release-manifest.json").write_text("{ not json", encoding="utf-8")
    before = _tree_snapshot(target)

    assert _regenerate(target) == 2
    assert _tree_snapshot(target) == before


def test_it_refuses_a_release_that_is_not_a_synthetic_fixture(tmp_path: Path) -> None:
    """A real release under `--out` is a mistyped path at best; never overwrite one."""
    target = tmp_path / "corpus-release-2026-08"
    shutil.copytree(COMMITTED_BUNDLE_DIR, target)
    manifest_path = target / "release-manifest.json"
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    document["release_kind"] = "CANDIDATE"
    manifest_path.write_text(json.dumps(document, indent=2), encoding="utf-8")
    before = _tree_snapshot(target)

    assert _regenerate(target) == 2
    assert _tree_snapshot(target) == before


def test_it_refuses_a_bundle_shaped_directory_carrying_a_foreign_file(tmp_path: Path) -> None:
    """A `release-manifest.json` alone is not proof; the layout must be PRD §18.4 and nothing else."""
    target = tmp_path / "corpus-release-fixture-v1"
    shutil.copytree(COMMITTED_BUNDLE_DIR, target)
    (target / "customer-export.csv").write_text("id,name\n", encoding="utf-8")
    before = _tree_snapshot(target)

    assert _regenerate(target) == 2
    assert _tree_snapshot(target) == before


@pytest.mark.skipif(not hasattr(Path, "symlink_to"), reason="platform has no symlinks")
def test_it_refuses_a_symlink_rather_than_following_it(tmp_path: Path) -> None:
    real = tmp_path / "real-directory"
    (real).mkdir()
    (real / "keepme.txt").write_text("keep\n", encoding="utf-8")
    link = tmp_path / "link"
    try:
        link.symlink_to(real, target_is_directory=True)
    except (OSError, NotImplementedError):  # Windows without developer mode
        pytest.skip("this account cannot create symlinks")

    assert _regenerate(link) == 2
    assert (real / "keepme.txt").read_text(encoding="utf-8") == "keep\n"


def test_the_guard_itself_names_the_reason(tmp_path: Path) -> None:
    """A refusal a user cannot act on gets worked around; assert the message is specific."""
    target = tmp_path / "populated"
    target.mkdir()
    (target / "file.txt").write_text("x", encoding="utf-8")

    with pytest.raises(cli.UnsafeOutputDirectory) as raised:
        cli.assert_rewritable(target)
    message = str(raised.value)
    assert "not a fixture bundle" in message
    assert str(target) in message


# ==================================================================================================
# Concurrency — two runs must not share a staging path
# ==================================================================================================


def test_concurrent_regenerations_in_one_parent_directory_all_succeed(tmp_path: Path) -> None:
    """Both lanes stage inside ONE parent — the shared scratch area the old fixed path lived in."""
    parent = tmp_path / "shared-parent"
    parent.mkdir()
    targets = [parent / f"corpus-release-fixture-lane{index}" for index in range(2)]
    results: dict[int, int] = {}
    errors: list[BaseException] = []

    def run(index: int) -> None:
        try:
            results[index] = _regenerate(targets[index], now=True)
        except BaseException as error:  # noqa: BLE001 - re-raised in the assertion below
            errors.append(error)

    threads = [threading.Thread(target=run, args=(index,)) for index in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=300)

    assert not errors, errors
    assert results == {0: 0, 1: 0}
    for target in targets:
        assert (target / "release-manifest.json").is_file()
    assert sorted(path.name for path in parent.iterdir()) == [
        target.name for target in targets
    ], "a staging directory survived, or one lane deleted the other's"


def test_staging_directories_are_unique_per_invocation(tmp_path: Path) -> None:
    """The regression, deterministically: two runs against THE SAME `--out` must not share a path.

    The old code derived staging from `out_dir.parent / f".{out_dir.name}.staging"` and rmtree'd it
    on entry, so two concurrent invocations with the same `--out` — exactly what two lanes
    regenerating the committed bundle would do — computed one path and deleted each other's
    in-flight build. Driving the same target twice makes that collision deterministic to assert
    without racing threads.
    """
    observed: list[str] = []
    real_mkdtemp = cli.tempfile.mkdtemp

    def recording_mkdtemp(*args: object, **kwargs: object) -> str:
        path = real_mkdtemp(*args, **kwargs)  # type: ignore[arg-type]
        observed.append(path)
        return path

    target = tmp_path / "one" / "corpus-release-fixture-v1"
    cli.tempfile.mkdtemp = recording_mkdtemp  # type: ignore[assignment]
    try:
        assert _regenerate(target, now=True) == 0
        assert _regenerate(target, now=True) == 0
    finally:
        cli.tempfile.mkdtemp = real_mkdtemp  # type: ignore[assignment]

    assert len(observed) == 2
    assert len(set(observed)) == 2, observed
    for path in observed:
        assert not Path(path).exists(), "the staging directory was not cleaned up"


# ==================================================================================================
# Argument surface
# ==================================================================================================


def test_the_default_out_is_the_committed_bundle(tmp_path: Path) -> None:
    """Without `--out` the command targets the committed artifact — deliverable 8's promise.

    Asserted by parsing, never by running: this test must not rewrite the signed artifact.
    """
    parser_default = cli.COMMITTED_BUNDLE_DIR
    assert parser_default == COMMITTED_BUNDLE_DIR
    assert parser_default.name == "corpus-release-fixture-v1"


def test_an_unknown_subcommand_is_rejected() -> None:
    with pytest.raises(SystemExit) as raised:
        cli.main(["demolish"])
    assert raised.value.code != 0


def test_the_recorded_build_timestamp_is_reused_unless_now_is_passed(tmp_path: Path) -> None:
    target = tmp_path / "corpus-release-fixture-v1"
    shutil.copytree(COMMITTED_BUNDLE_DIR, target)

    assert _regenerate(target) == 0
    document = json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
    assert document["build_started_at"] == committed_build_timestamp()

    assert _regenerate(target, now=True) == 0
    refreshed = json.loads((target / "release-manifest.json").read_text(encoding="utf-8"))
    assert refreshed["release_kind"] == "SYNTHETIC_FIXTURE"
