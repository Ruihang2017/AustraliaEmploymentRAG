"""Import bootstrap and shared fixtures for the CRPS-08 suite.

NOT named `conftest.py` on purpose — see `conftest.py`.

Two directories go on `sys.path` here, and neither is importable by package path (both parents
contain a hyphen): CRPS-01's module root `pipelines/corpus-builder/src` (for `contracts` and
`manifest`) and `pipelines/corpus-builder/fixtures` (for `generator.*` and `consumer_checks`). The
repository root is located by walking up for BOTH root manifests, which works unchanged inside a
`/start-all` git worktree.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path
from typing import Iterator

import pytest


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
MODULE_DIR = REPO_ROOT / "pipelines" / "corpus-builder"
FIXTURES_DIR = MODULE_DIR / "fixtures"

for _entry in (str(MODULE_DIR / "src"), str(FIXTURES_DIR)):
    if _entry not in sys.path:
        sys.path.insert(0, _entry)

from generator._paths import (  # noqa: E402
    COMMITTED_BUNDLE_DIR,
    DEV_PUBLIC_KEYFILE,
    DEV_SIGNER_ID,
    SEED_DEFAULT,
)
from generator.build_fixture import build_fixture_release  # noqa: E402
from generator.synthetic_corpus import generate_corpus  # noqa: E402,F401

from contracts.schema import open_corpus_database  # noqa: E402
from manifest import public_keys_from  # noqa: E402

__all__ = [
    "COMMITTED_BUNDLE_DIR",
    "DEV_PUBLIC_KEYFILE",
    "DEV_SIGNER_ID",
    "FIXTURES_DIR",
    "MODULE_DIR",
    "REPO_ROOT",
    "SEED_DEFAULT",
    "bundle_file_map",
    "committed_build_timestamp",
    "corpus_connection",
    "regenerated_bundle",
    "trusted_keys",
]


#: The build timestamp recorded in the committed bundle. Read from the artifact rather than
#: hard-coded, so a regeneration test can rebuild the SAME bytes without this file being a second
#: place that has to be kept in step with the manifest.
def committed_build_timestamp() -> str:
    document = json.loads(
        (COMMITTED_BUNDLE_DIR / "release-manifest.json").read_text(encoding="utf-8")
    )
    return str(document["build_started_at"])


def bundle_file_map(bundle: Path) -> dict[str, bytes]:
    """Every regular file under *bundle*, keyed by POSIX-relative path."""
    return {
        path.relative_to(bundle).as_posix(): path.read_bytes()
        for path in sorted(bundle.rglob("*"))
        if path.is_file()
    }


@pytest.fixture
def trusted_keys() -> dict[str, bytes]:
    """The verifier's trust map, built ONLY from the committed development PUBLIC key file."""
    return public_keys_from(DEV_PUBLIC_KEYFILE)


@pytest.fixture(scope="session")
def corpus_connection() -> Iterator[sqlite3.Connection]:
    """A READ-ONLY connection to the COMMITTED bundle's `corpus.sqlite`.

    The ticket's test plan requires the inventory assertions to run against the committed artifact,
    so a stale one fails. Read-only via a `mode=ro` URI, so the suite can neither mutate a signed
    artifact nor leave a `-wal`/`-shm` beside it (which `verify_bundle()` would then report as
    `BUNDLE_FILE_UNLISTED`).
    """
    connection = open_corpus_database(COMMITTED_BUNDLE_DIR / "corpus.sqlite", read_only=True)
    try:
        yield connection
    finally:
        connection.close()


@pytest.fixture
def regenerated_bundle(tmp_path: Path) -> Path:
    """A freshly built bundle in `tmp_path`, stamped with the committed bundle's build time."""
    return build_fixture_release(
        tmp_path / "corpus-release-fixture-v1",
        seed=SEED_DEFAULT,
        built_at=committed_build_timestamp(),
    )
