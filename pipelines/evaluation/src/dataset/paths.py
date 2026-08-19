"""Filesystem anchors for the GOLD-01 evaluation dataset package.

Every path is derived from this file's own location and never from `os.getcwd()`, so the package
works unchanged inside the `/start-all` git worktrees, where the repository root is not the process
working directory (plan R5).
"""

from __future__ import annotations

from pathlib import Path

__all__ = [
    "CASES_DIR",
    "EVALS_DIR",
    "MIGRATIONS_DIR",
    "PACKAGE_ROOT",
    "REPO_ROOT",
    "SCHEMAS_DIR",
    "SPLITS_DIR",
    "VERSIONS_DIR",
    "repo_root",
]

#: ``pipelines/evaluation`` — the uv workspace member this package lives in.
PACKAGE_ROOT: Path = Path(__file__).resolve().parents[2]


def repo_root(start: Path | None = None) -> Path:
    """Walk up from *start* to the directory holding BOTH root manifests.

    Both markers are required: `pyproject.toml` alone matches every uv workspace member, and
    `pnpm-workspace.yaml` alone would match a future nested pnpm workspace. Shape copied from
    `pipelines/corpus-builder/src/contracts/paths.py` (CRPS-01), which is the repository convention.
    """
    current = (start or Path(__file__)).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(
        "cannot locate the repository root: no ancestor of "
        f"{current} holds both pyproject.toml and pnpm-workspace.yaml"
    )


REPO_ROOT: Path = repo_root()

#: ``schemas/evaluation`` — the seven JSON Schemas this ticket owns.
SCHEMAS_DIR: Path = REPO_ROOT / "schemas" / "evaluation"

#: ``evals`` — the dataset root.
EVALS_DIR: Path = REPO_ROOT / "evals"

#: ``evals/splits`` — frozen allocation, id rules, the recipient public key and the version registry.
SPLITS_DIR: Path = EVALS_DIR / "splits"

#: ``evals/cases`` — one directory per category (GOLD-05 … GOLD-14 own the contents).
CASES_DIR: Path = EVALS_DIR / "cases"

#: ``evals/splits/dataset-versions`` — the D8 version registry instances.
VERSIONS_DIR: Path = SPLITS_DIR / "dataset-versions"

#: ``evals/splits/migrations`` — the D8 migration records.
MIGRATIONS_DIR: Path = SPLITS_DIR / "migrations"
