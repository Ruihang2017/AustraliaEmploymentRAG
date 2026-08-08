"""`taxrag_pipeline_ingestion` — the local Python ingestion framework (PRD §18.2, §20.1).

IMPORT ROOT (sub-PRD D11, open question M4)
-------------------------------------------
The import root is `taxrag_pipeline_ingestion`, read from the committed
`pipelines/ingestion/pyproject.toml` (`name = "taxrag-pipeline-ingestion"`, PEP 503 name with
hyphens folded to underscores) exactly as INGF-01 deliverable 1 requires. The `aer_ingestion`
fallback is therefore NOT used.

The real code lives at `pipelines/ingestion/src/taxrag_pipeline_ingestion/**` (Python src-layout).
`FND-01`'s skeleton package `pipelines/ingestion/taxrag_pipeline_ingestion/__init__.py` stays
byte-empty and must not be filled or deleted: `tools/workspace-assertions.mjs::assertSkeleton()`
requires exactly one direct child directory holding an `__init__.py` per uv member, and
`assertEntryFilesEmpty()` requires that file to be empty. Both run under `pnpm test` on every
branch. That is why `FRAMEWORK_VERSION` and `INTERMEDIATE_SCHEMA_VERSION` live here rather than at
the member root, and why `src/` itself carries no `__init__.py`.

CROSS-MEMBER IMPORTS
--------------------
Every uv member declares `[tool.uv] package = false`, so nothing is installed into the virtual
environment and the member directory names contain hyphens (not importable by package path). The
only mechanism by which this package can reach `CRPS-01`'s record contract under
`pipelines/corpus-builder/src/contracts/` is `sys.path`. `_ensure_contracts_importable()` below
does exactly that, once, at import time. This is a repository-wide convention (CRPS-01 flagged the
identical one as an ADR candidate); INGF-01's plan raises it again as an ADR candidate
`docs/adr/NNNN-python-cross-member-import-root.md`, which this ticket does not write (out of
file-scope).
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

__all__ = ["FRAMEWORK_VERSION", "INTERMEDIATE_SCHEMA_VERSION"]

#: Semantic version of the ingestion framework itself (INGF-01 deliverable 1). It is one of the
#: `tool_versions` keys carried by every `IntermediateRecordEnvelope` (PRD §40.7).
FRAMEWORK_VERSION: str = "0.1.0"

#: Version of the intermediate normalised-record envelope shape (PRD §40.7, INGF-01 deliverable 8).
#: Bumping it is a compatibility event for every one of the 52 source adapters.
INTERMEDIATE_SCHEMA_VERSION: str = "1"


def _repo_root(start: Path) -> Path | None:
    """The directory holding BOTH root manifests, or `None`.

    Walking up for two markers (not one) is what makes this correct inside a `/start-all` git
    worktree as well as in a normal checkout.
    """
    for candidate in [start, *start.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    return None


def _ensure_contracts_importable() -> None:
    """Put `pipelines/corpus-builder/src` on `sys.path` when `contracts` is not already reachable.

    Idempotent, silent when the path is already present, and a no-op — never an exception — when the
    repository root cannot be located. In that last case `taxrag_pipeline_ingestion.adapter.records`
    fails with a plain `ImportError`, which is the honest signal.

    The member `src` directory is APPENDED, so a caller that has already arranged its own
    `contracts` (a test conftest, for example) keeps precedence.
    """
    if importlib.util.find_spec("contracts") is not None:
        return
    root = _repo_root(Path(__file__).resolve())
    if root is None:
        return
    contracts_src = str(root / "pipelines" / "corpus-builder" / "src")
    if contracts_src not in sys.path:
        sys.path.append(contracts_src)


_ensure_contracts_importable()
