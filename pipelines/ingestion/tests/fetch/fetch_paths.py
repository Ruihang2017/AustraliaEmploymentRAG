"""Import paths and fixture locations for the INGF-02 suite — in a UNIQUELY NAMED module.

This deliberately does not live in `conftest.py`, and the test modules deliberately do not use
`from conftest import ...`. There is no `__init__.py` anywhere in this tree
(`tools/workspace-assertions.mjs` requires each uv member to hold exactly ONE direct child directory
containing one), so every `conftest.py` in the repository competes for the single top-level module
name `conftest` under pytest's prepend import mode. Whichever is imported first wins: running the
whole repository suite resolved `conftest` to
`pipelines/corpus-builder/tests/tiering/conftest.py` and this suite failed to import at all, while
running `pipelines/ingestion/tests/fetch` alone passed. A uniquely named module cannot collide.

Nothing is installed (`[tool.uv] package = false` in every member manifest) and the member
directory names contain hyphens, so `pipelines/ingestion/src` and `pipelines/corpus-builder/src`
have to be prepended to `sys.path` here, exactly as INGF-01's `tests/adapter/conftest.py` does.
`pipelines/ingestion/tests/adapter` is prepended too, so INGF-01's `adapter_archscan` scanner can be
IMPORTED by the architecture test rather than copied. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.
"""

from __future__ import annotations

import ipaddress
import sys
from pathlib import Path

__all__ = [
    "ADAPTERS_TREE",
    "ADAPTER_TESTS",
    "ALLOWLIST_FIXTURES",
    "BOMB_FIXTURES",
    "CONTRACTS_SRC",
    "DIRTY_FIXTURES",
    "FETCH_FIXTURES",
    "FETCH_SRC",
    "FETCH_TESTS",
    "INGESTION_MEMBER",
    "OutboundNetworkDenied",
    "REPO_ROOT",
    "is_loopback_address",
]


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
INGESTION_MEMBER = REPO_ROOT / "pipelines" / "ingestion"
FETCH_SRC = INGESTION_MEMBER / "src" / "taxrag_pipeline_ingestion" / "fetch"
CONTRACTS_SRC = REPO_ROOT / "pipelines" / "corpus-builder" / "src"
ADAPTER_TESTS = INGESTION_MEMBER / "tests" / "adapter"
ADAPTERS_TREE = REPO_ROOT / "pipelines" / "adapters"

for _path in (ADAPTER_TESTS, CONTRACTS_SRC, INGESTION_MEMBER / "src"):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

FETCH_TESTS = Path(__file__).resolve().parent
FETCH_FIXTURES = FETCH_TESTS / "fixtures"
ALLOWLIST_FIXTURES = FETCH_FIXTURES / "adapters"
BOMB_FIXTURES = FETCH_FIXTURES / "bombs"
DIRTY_FIXTURES = FETCH_FIXTURES / "dirty"


class OutboundNetworkDenied(RuntimeError):
    """The suite attempted to leave the machine — always a test bug, never an expected outcome."""


def is_loopback_address(address: object) -> bool:
    """True only for a socket address tuple naming a loopback IP LITERAL."""
    if not isinstance(address, tuple) or not address:
        return False
    host = address[0]
    if not isinstance(host, str):
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False
