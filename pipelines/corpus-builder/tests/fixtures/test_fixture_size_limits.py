"""Deliverable 5's hard limits: ≤ 20 MiB total, no single file > 8 MiB.

Measured over `git ls-files` output rather than a directory walk, so an untracked local file cannot
mask a violation — and so a file that is present on disk but was never committed cannot be counted
as if consumers would receive it.
"""

from __future__ import annotations

import subprocess

from fixture_release_helpers import COMMITTED_BUNDLE_DIR, REPO_ROOT

TOTAL_LIMIT = 20 * 1024 * 1024
FILE_LIMIT = 8 * 1024 * 1024


def _tracked_bundle_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", "-z", "--", str(COMMITTED_BUNDLE_DIR.relative_to(REPO_ROOT).as_posix())],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [name for name in result.stdout.split("\0") if name]


def test_every_bundle_member_is_tracked_by_git() -> None:
    tracked = {name.rsplit("/", 1)[-1] for name in _tracked_bundle_files()}
    assert tracked == {
        "corpus.sqlite",
        "embedding-manifest.json",
        "release-manifest.json",
        "INDEX_STATE.json",
        "vectors.usearch",
    }, sorted(tracked)


def test_no_single_committed_file_exceeds_eight_mebibytes() -> None:
    offenders = [
        (name, (REPO_ROOT / name).stat().st_size)
        for name in _tracked_bundle_files()
        if (REPO_ROOT / name).stat().st_size > FILE_LIMIT
    ]
    assert offenders == [], offenders


def test_the_committed_bundle_is_under_twenty_mebibytes() -> None:
    total = sum((REPO_ROOT / name).stat().st_size for name in _tracked_bundle_files())
    assert 0 < total <= TOTAL_LIMIT, total
