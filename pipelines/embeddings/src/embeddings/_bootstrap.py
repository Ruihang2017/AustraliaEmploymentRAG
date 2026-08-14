"""The ONE module allowed to touch `sys.path` (CRPS-05).

WHY THIS EXISTS
---------------
`pipelines/corpus-builder/src` holds the contracts, chunker, tiering policy and manifest model this
pipeline consumes. Its member directory name contains a hyphen, so it is not importable by package
path, and the root pytest config puts only the repository root on `sys.path`. The convention fixed
by CRPS-01 (`src/contracts/__init__.py`) is that modules under `pipelines/corpus-builder/src/` are
TOP-LEVEL modules rooted at that directory, and a consumer prepends the directory itself.

CRPS-05 is the first ticket to extend that convention ACROSS uv workspace members, and from
production code rather than a test `conftest.py`. That is flagged as an ADR candidate in the build
report; it is not decided here. Confining it to this single module is what keeps the decision
reversible: when `FND-01` publishes those packages properly, only this file changes.

The repository root is located by walking up for BOTH root manifests (`pyproject.toml` AND
`pnpm-workspace.yaml`), which is what makes it work inside a `/start-all` git worktree where the
process working directory is not the repository root. Nothing here reads `os.getcwd()`, an
environment variable or a lockfile.

Every accessor is lazy and memoised: importing `embeddings` must not require the corpus-builder
tree to be present, so that a stdlib-only unit test can import a single module in isolation.
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path
from types import ModuleType

__all__ = [
    "CORPUS_BUILDER_SRC",
    "load_chunking",
    "load_contracts_schema",
    "load_contracts_validate",
    "load_contracts_version",
    "load_manifest",
    "load_manifest_paths",
    "load_manifest_verify",
    "load_tiering",
    "repo_root",
]


@lru_cache(maxsize=1)
def repo_root() -> Path:
    """The directory holding BOTH root manifests.

    Both markers are required: `pyproject.toml` alone matches every uv workspace member, and
    `pnpm-workspace.yaml` alone would match a future nested pnpm workspace. Copied verbatim from
    `contracts.paths.repo_root` rather than imported, because importing it is what this function
    exists to make possible.
    """
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(
        "cannot locate the repository root: no ancestor of "
        f"{here} holds both pyproject.toml and pnpm-workspace.yaml"
    )


def CORPUS_BUILDER_SRC() -> Path:  # noqa: N802 - a lazy constant, deliberately not evaluated at import
    """`pipelines/corpus-builder/src` — the top-level module root fixed by CRPS-01."""
    return repo_root() / "pipelines" / "corpus-builder" / "src"


@lru_cache(maxsize=1)
def _ensure_on_path() -> None:
    """Prepend the corpus-builder source root exactly once, idempotently."""
    source_root = str(CORPUS_BUILDER_SRC())
    if source_root not in sys.path:
        sys.path.insert(0, source_root)


def _load(module_name: str) -> ModuleType:
    _ensure_on_path()
    import importlib

    return importlib.import_module(module_name)


@lru_cache(maxsize=None)
def _cached(module_name: str) -> ModuleType:
    return _load(module_name)


def load_tiering() -> ModuleType:
    """CRPS-04's `tiering` package — `IndexTier`, `is_eligible_for_dense`, `assign_tiers`."""
    return _cached("tiering")


def load_manifest() -> ModuleType:
    """CRPS-02's `manifest` package — `EmbeddingManifest` and every pin dataclass."""
    return _cached("manifest")


def load_manifest_paths() -> ModuleType:
    """`manifest.paths` — `schema_documents()`. NOT re-exported from `manifest`."""
    return _cached("manifest.paths")


def load_manifest_verify() -> ModuleType:
    """`manifest.verify` — `EMBEDDING_SCHEMA_ID`. NOT re-exported from `manifest`."""
    return _cached("manifest.verify")


def load_chunking() -> ModuleType:
    """CRPS-03's `chunking` package. Used by fixtures; production code does not chunk."""
    return _cached("chunking")


def load_contracts_schema() -> ModuleType:
    """CRPS-01's `contracts.schema` — `open_corpus_database`, `utc_now`."""
    return _cached("contracts.schema")


def load_contracts_validate() -> ModuleType:
    """CRPS-01's `contracts.validate` — `sha256_hex`, the repository's text-hash rule."""
    return _cached("contracts.validate")


def load_contracts_version() -> ModuleType:
    """CRPS-01's `contracts.version` — `CONTRACT_VERSION`."""
    return _cached("contracts.version")
