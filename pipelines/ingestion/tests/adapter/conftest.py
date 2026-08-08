"""Import paths for the INGF-01 adapter-contract suite.

Nothing is installed (`[tool.uv] package = false` in every member manifest) and the member directory
names contain hyphens, so neither `pipelines/ingestion/src` nor `pipelines/corpus-builder/src` is
importable by package path. The root pytest config puts only the repository root on `sys.path`, so
this test directory prepends both, exactly as the CRPS-01/CRPS-03 suites do. The repository root is
located by walking up for BOTH root manifests, which works unchanged inside a `/start-all` git
worktree.

There is deliberately NO `__init__.py` in this directory or in `pipelines/ingestion/tests`:
`tools/workspace-assertions.mjs::assertSkeleton()` requires each uv member to hold exactly ONE
direct child directory containing an `__init__.py`, and that one is FND-01's byte-empty skeleton
package at the member root.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
SRC = REPO_ROOT / "pipelines" / "ingestion" / "src"
CONTRACTS_SRC = REPO_ROOT / "pipelines" / "corpus-builder" / "src"

for _path in (CONTRACTS_SRC, SRC):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

FIXTURES = Path(__file__).resolve().parent / "fixtures"
ADAPTER_FIXTURES = FIXTURES / "adapters"
ADAPTERS_TREE = REPO_ROOT / "pipelines" / "adapters"
