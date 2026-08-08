"""Filesystem anchors for the corpus schema and the intermediate-record contract.

Every path is derived from this file's own location, so the package works unchanged inside the
`/start-all` git worktrees (where the repository root is not the process working directory).
"""

from __future__ import annotations

from pathlib import Path

__all__ = [
    "CONTRACTS_ENUM_EXPORT",
    "CORPUS_SCHEMA_DIR",
    "INTERMEDIATE_SCHEMA_DIR",
    "PACKAGE_ROOT",
    "SCHEMA_DIR",
    "repo_root",
]

#: ``pipelines/corpus-builder`` — the uv workspace member this contract package lives in.
PACKAGE_ROOT: Path = Path(__file__).resolve().parents[2]

#: ``pipelines/corpus-builder/schema``
SCHEMA_DIR: Path = PACKAGE_ROOT / "schema"

#: ``pipelines/corpus-builder/schema/corpus`` — the corpus.sqlite DDL template + enum map.
CORPUS_SCHEMA_DIR: Path = SCHEMA_DIR / "corpus"

#: ``pipelines/corpus-builder/schema/intermediate/v1`` — the versioned INR JSON Schema set.
INTERMEDIATE_SCHEMA_DIR: Path = SCHEMA_DIR / "intermediate" / "v1"


def repo_root(start: Path | None = None) -> Path:
    """Walk up from *start* to the directory holding both root manifests.

    Both markers are required: `pyproject.toml` alone matches every uv workspace member, and
    `pnpm-workspace.yaml` alone would match a future nested pnpm workspace.
    """
    current = (start or Path(__file__)).resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(
        "cannot locate the repository root: no ancestor of "
        f"{current} holds both pyproject.toml and pnpm-workspace.yaml"
    )


#: The ONLY machine-readable, non-TypeScript form of the canonical enum vocabulary that
#: `packages/contracts` (FND-03) publishes today.
#:
#: Reading a `test/` path from production code is a coupling, not a pattern — it is defensible here
#: and nowhere else because `packages/contracts/test/enums/enum-replay.test.ts` asserts this file
#: equal to `ENUM_REGISTRY` in BOTH directions (per family, member order, family set and
#: `prdSection`), and that test runs under `pnpm test` on every branch. Reading it is therefore
#: provably equivalent to reading the registry, and any drift is already a hard CI failure.
#:
#: The residual defect — that the export sits on a test path — is Q-CRPS-4: `FND-03` should publish
#: it at a stable non-test path (e.g. `packages/contracts/enums.json`), after which only this one
#: constant changes. See docs/prd/04-corpus-contract/README.md.
CONTRACTS_ENUM_EXPORT: Path = (
    repo_root() / "packages" / "contracts" / "test" / "enums" / "prd-enums.fixture.json"
)
