"""Import path and fixture locations for the intermediate-record contract suite.

See `tests/schema/conftest.py` for why the `sys.path` entry is needed. `test_schema_only.py`
deliberately does NOT rely on it — that module proves a source module can conform to the contract
with a generic JSON-Schema validator and no builder import at all.
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
_SRC = str(REPO_ROOT / "pipelines" / "corpus-builder" / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
VALID_RUN = FIXTURES / "valid" / "run-001"
INVALID_DIR = FIXTURES / "invalid"
