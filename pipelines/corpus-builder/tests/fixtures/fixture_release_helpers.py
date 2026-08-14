"""Import bootstrap and shared fixtures for the CRPS-08 suite.

NOT named `conftest.py` on purpose — see `conftest.py`.

Two directories go on `sys.path` here, and neither is importable by package path (both parents
contain a hyphen): CRPS-01's module root `pipelines/corpus-builder/src` (for `contracts` and
`manifest`) and `pipelines/corpus-builder/fixtures` (for `generator.*` and `consumer_checks`). The
repository root is located by walking up for BOTH root manifests, which works unchanged inside a
`/start-all` git worktree.
"""

from __future__ import annotations

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
from generator.synthetic_corpus import generate_corpus  # noqa: E402

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
    "corpus_connection",
    "trusted_keys",
]


@pytest.fixture
def trusted_keys() -> dict[str, bytes]:
    """The verifier's trust map, built ONLY from the committed development PUBLIC key file."""
    return public_keys_from(DEV_PUBLIC_KEYFILE)


@pytest.fixture(scope="session")
def corpus_connection(tmp_path_factory: pytest.TempPathFactory) -> Iterator[sqlite3.Connection]:
    """A READ-ONLY connection to a freshly generated fixture corpus.

    Generated into a temporary directory rather than opened from the committed bundle: the committed
    `corpus.sqlite` is a signed artifact, and a suite that opened it read-write — or left a `-wal`
    beside it — would dirty the tree. `test_fixture_determinism.py` proves the two are the same
    bytes, so an assertion made here holds of the committed artifact too.
    """
    database = tmp_path_factory.mktemp("crps08-corpus") / "corpus.sqlite"
    generate_corpus(database, seed=SEED_DEFAULT)
    connection = open_corpus_database(database, read_only=True)
    try:
        yield connection
    finally:
        connection.close()
