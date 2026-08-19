"""Import paths, the no-outbound-network guard, and the offline fixtures for the INGF-02 suite.

Mirrors `tests/adapter/conftest.py` (INGF-01): nothing is installed (`[tool.uv] package = false` in
every member manifest) and the member directory names contain hyphens, so `pipelines/ingestion/src`
and `pipelines/corpus-builder/src` have to be prepended to `sys.path` here. The repository root is
located by walking up for BOTH root manifests, which works unchanged inside a `/start-all` git
worktree. `pipelines/ingestion/tests/adapter` is prepended too, so INGF-01's `adapter_archscan`
scanner can be IMPORTED by `test_architecture.py` rather than copied.

There is deliberately NO `__init__.py` in this directory: `tools/workspace-assertions.mjs`
requires each uv member to hold exactly ONE direct child directory containing an `__init__.py`.

THE NETWORK GUARD (deliverable 10, acceptance "the whole tests/fetch suite runs with outbound
network disabled"). A session-scoped autouse fixture makes `socket.getaddrinfo` raise and makes any
connect to a non-loopback address fail loudly. A suite that silently reached the internet would
prove nothing about the SSRF controls, and would be flaky in CI.
"""

from __future__ import annotations

import ipaddress
import socket
import sys
from pathlib import Path

import pytest


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

FETCH_FIXTURES = Path(__file__).resolve().parent / "fixtures"
ALLOWLIST_FIXTURES = FETCH_FIXTURES / "adapters"
BOMB_FIXTURES = FETCH_FIXTURES / "bombs"
DIRTY_FIXTURES = FETCH_FIXTURES / "dirty"


class OutboundNetworkDenied(RuntimeError):
    """The suite attempted to leave the machine — always a test bug, never an expected outcome."""


def _is_loopback(address: object) -> bool:
    if not isinstance(address, tuple) or not address:
        return False
    host = address[0]
    if not isinstance(host, str):
        return False
    try:
        parsed = ipaddress.ip_address(host)
    except ValueError:
        return False
    return parsed.is_loopback


@pytest.fixture(scope="session", autouse=True)
def no_outbound_network() -> object:
    """Disable DNS entirely and refuse any connect to a non-loopback address."""
    real_getaddrinfo = socket.getaddrinfo
    real_connect = socket.socket.connect
    real_create_connection = socket.create_connection

    def guarded_getaddrinfo(*args: object, **kwargs: object) -> object:
        raise OutboundNetworkDenied(
            "socket.getaddrinfo is disabled in the INGF-02 suite; use ScriptedResolver"
        )

    def guarded_connect(self: socket.socket, address: object) -> object:
        if not _is_loopback(address):
            raise OutboundNetworkDenied(f"refusing a non-loopback connect to {address!r}")
        return real_connect(self, address)

    def guarded_create_connection(address: object, *args: object, **kwargs: object) -> object:
        if not _is_loopback(address):
            raise OutboundNetworkDenied(f"refusing a non-loopback connect to {address!r}")
        return real_create_connection(address, *args, **kwargs)  # type: ignore[arg-type]

    socket.getaddrinfo = guarded_getaddrinfo  # type: ignore[assignment]
    socket.socket.connect = guarded_connect  # type: ignore[method-assign]
    socket.create_connection = guarded_create_connection  # type: ignore[assignment]
    try:
        yield None
    finally:
        socket.getaddrinfo = real_getaddrinfo  # type: ignore[assignment]
        socket.socket.connect = real_connect  # type: ignore[method-assign]
        socket.create_connection = real_create_connection  # type: ignore[assignment]
