"""Filesystem anchors for the versioned corpus-manifest contract root.

Every path is derived from `contracts.paths.repo_root()`, which walks up for BOTH root manifests,
so the package works unchanged inside the `/start-all` git worktrees where the repository root is
not the process working directory. Nothing here reads `os.getcwd()` or an environment variable.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from contracts.jsonschema_min import load_documents
from contracts.paths import repo_root

__all__ = [
    "MANIFEST_SCHEMA_ROOT",
    "schema_dir",
    "schema_documents",
    "supported_majors",
]

#: ``schemas/corpus-manifest`` — the PRD §44.3 serial-owned contract root owned by 04-corpus-contract.
MANIFEST_SCHEMA_ROOT: Path = repo_root() / "schemas" / "corpus-manifest"


def schema_dir(major: int) -> Path:
    """``schemas/corpus-manifest/v<major>`` — deliverable 9's versioning rule made a path."""
    return MANIFEST_SCHEMA_ROOT / f"v{major}"


@lru_cache(maxsize=None)
def schema_documents(major: int) -> Mapping[str, Any]:
    """Every schema document of major version *major*, keyed by its own ``$id``.

    The mapping is what `Draft202012Validator` resolves `$ref` inside; nothing is ever fetched over
    the network.
    """
    directory = schema_dir(major)
    if not directory.is_dir():
        raise FileNotFoundError(f"no corpus-manifest schema directory for major version {major}: {directory}")
    return load_documents(sorted(directory.glob("*.schema.json")))


def supported_majors() -> tuple[int, ...]:
    """The major versions present on disk, ascending. Today only ``v1`` exists."""
    if not MANIFEST_SCHEMA_ROOT.is_dir():
        return ()
    found = []
    for entry in MANIFEST_SCHEMA_ROOT.iterdir():
        if entry.is_dir() and entry.name.startswith("v") and entry.name[1:].isdigit():
            found.append(int(entry.name[1:]))
    return tuple(sorted(found))
