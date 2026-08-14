"""Deliverable 4: the bundle is a pure function of `(seed, key, built_at)`.

Two independent builds must be byte-identical, and the committed artifact must equal a rebuild —
otherwise the committed bundle is stale and everything asserted about it elsewhere describes a file
nobody can reproduce.

CROSS-PLATFORM CAVEAT, stated where it will be read. SQLite's on-disk page layout is stable for a
given library build; a different SQLite could in principle produce different bytes for the same
logical content. Failure messages therefore print `sqlite3.sqlite_version` and `sys.version` for
both sides, so the diagnosis is one line rather than an afternoon. If that divergence is ever
observed, it is a TICKET writeback (amend the determinism clause), never a locally weakened
assertion.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

from fixture_release_helpers import (
    COMMITTED_BUNDLE_DIR,
    SEED_DEFAULT,
    bundle_file_map,
    committed_build_timestamp,
)

from generator.build_fixture import build_fixture_release

_ENVIRONMENT = f"sqlite {sqlite3.sqlite_version}, python {sys.version}"

#: Everything a fresh build timestamp legitimately changes. Anything else differing is a defect.
TIMESTAMP_DEPENDENT = frozenset(
    {"build_started_at", "build_finished_at", "created_at", "signature", "manifest_sha256"}
)


def test_two_builds_with_the_same_inputs_are_byte_identical(tmp_path: Path) -> None:
    stamp = committed_build_timestamp()
    first = build_fixture_release(tmp_path / "one", seed=SEED_DEFAULT, built_at=stamp)
    second = build_fixture_release(tmp_path / "two", seed=SEED_DEFAULT, built_at=stamp)
    left, right = bundle_file_map(first), bundle_file_map(second)
    assert sorted(left) == sorted(right)
    differing = [name for name in left if left[name] != right[name]]
    assert differing == [], f"{differing} differ between two identical builds ({_ENVIRONMENT})"


def test_the_committed_bundle_equals_a_rebuild(regenerated_bundle: Path) -> None:
    committed = bundle_file_map(COMMITTED_BUNDLE_DIR)
    rebuilt = bundle_file_map(regenerated_bundle)
    assert sorted(committed) == sorted(rebuilt)
    differing = [name for name in committed if committed[name] != rebuilt[name]]
    assert differing == [], (
        f"the committed bundle is stale or unreproducible; {differing} differ from a rebuild with "
        f"seed {SEED_DEFAULT} and the recorded build timestamp ({_ENVIRONMENT})"
    )


def test_a_fresh_timestamp_changes_only_the_timestamp_dependent_members(tmp_path: Path) -> None:
    """`built_at` is the ONLY non-deterministic input, and its blast radius is bounded."""
    stamp = committed_build_timestamp()
    pinned = build_fixture_release(tmp_path / "pinned", seed=SEED_DEFAULT, built_at=stamp)
    fresh = build_fixture_release(
        tmp_path / "fresh", seed=SEED_DEFAULT, built_at="2030-01-02T03:04:05Z"
    )

    left = json.loads((pinned / "release-manifest.json").read_text(encoding="utf-8"))
    right = json.loads((fresh / "release-manifest.json").read_text(encoding="utf-8"))
    assert sorted(left) == sorted(right)
    changed = {name for name in left if left[name] != right[name]}
    # `files[]` also changes: the embedding manifest carries `built_at`, so its hash moves with it.
    assert changed <= TIMESTAMP_DEPENDENT | {"files", "artifacts"}, changed
    assert TIMESTAMP_DEPENDENT <= changed

    # corpus.sqlite is unaffected by the build stamp: its metadata row is pinned to a constant.
    assert (pinned / "corpus.sqlite").read_bytes() == (fresh / "corpus.sqlite").read_bytes()
    assert (pinned / "tantivy" / "INDEX_STATE.json").read_bytes() == (
        fresh / "tantivy" / "INDEX_STATE.json"
    ).read_bytes()


def test_a_different_seed_changes_the_identifiers(tmp_path: Path) -> None:
    """A positive control: if the seed did not reach the ids, determinism would be meaningless."""
    stamp = committed_build_timestamp()
    default = build_fixture_release(tmp_path / "default", seed=SEED_DEFAULT, built_at=stamp)
    other = build_fixture_release(tmp_path / "other", seed=SEED_DEFAULT + 1, built_at=stamp)
    assert (default / "corpus.sqlite").read_bytes() != (other / "corpus.sqlite").read_bytes()


def test_the_generator_refuses_to_build_into_a_non_empty_directory(tmp_path: Path) -> None:
    """A stray file would surface as `BUNDLE_FILE_UNLISTED`; refuse it at the source instead."""
    import pytest

    from generator.build_fixture import FixtureBuildFailed

    target = tmp_path / "occupied"
    target.mkdir()
    (target / "leftover.txt").write_text("stale", encoding="utf-8")
    with pytest.raises(FixtureBuildFailed):
        build_fixture_release(target, seed=SEED_DEFAULT, built_at=committed_build_timestamp())
