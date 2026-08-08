"""Import path and per-test database fixtures for the corpus-schema suite.

`pipelines/corpus-builder/src` is not importable by package path (the directory name contains a
hyphen) and the root pytest config puts only the repository root on `sys.path`, so each test
directory in this ticket's file-scope prepends it here. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


_SRC = str(_repo_root() / "pipelines" / "corpus-builder" / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from contracts.schema import create_corpus_database, open_corpus_database  # noqa: E402


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    path = tmp_path / "corpus.sqlite"
    create_corpus_database(path)
    return path


@pytest.fixture
def conn(db_path: Path):
    connection = open_corpus_database(db_path, read_only=False)
    try:
        yield connection
    finally:
        connection.close()


@pytest.fixture
def readonly_conn(db_path: Path):
    connection = open_corpus_database(db_path)
    try:
        yield connection
    finally:
        connection.close()
