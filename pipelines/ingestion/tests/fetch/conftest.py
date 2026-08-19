"""Fixtures for the INGF-02 suite, and the no-outbound-network guard.

Paths and `sys.path` set-up live in `fetch_paths.py`, not here, because the module name `conftest`
is not unique across this repository — see that module's docstring for the failure it prevents.

THE NETWORK GUARD (deliverable 10, acceptance "the whole tests/fetch suite runs with outbound
network disabled"). A session-scoped autouse fixture makes `socket.getaddrinfo` refuse every name,
and makes any connect to a non-loopback address fail loudly. A suite that silently reached the
internet would prove nothing about the SSRF controls and would be flaky in CI. A loopback IP
LITERAL is still allowed through `getaddrinfo`, because `socket.create_connection` normalises even a
pinned `127.0.0.1` through it; no NAME is ever resolved.

WHY THE GUARD BINDS TO `_socket`, NOT TO WHATEVER IS CURRENTLY ON `socket`. `pipelines/embeddings`
installs its own network block (`tests/embedding_fixtures.py::block_all_network`) as a
SESSION-scoped autouse fixture that replaces `socket.socket.connect`, `socket.connect_ex`,
`socket.create_connection` and `socket.getaddrinfo` with a function that always raises. A
session-scoped fixture is only torn down at the END of the session, so from the first embeddings
test onwards those replacements stay in place for every module that runs afterwards — and
`pipelines/ingestion` sorts after `pipelines/embeddings`. Capturing "the current implementation"
here would capture that raising stub and every loopback connection in this suite would fail, which
is exactly what a whole-repository `uv run pytest` produced before this was traced. Binding to the
C-level `_socket` primitives, which nothing patches, makes this suite independent of any other
module's monkeypatching AND leaves the embeddings guard untouched — it is another ticket's control
and not this ticket's to weaken. The leak itself is reported as a cross-ticket defect.
"""

from __future__ import annotations

import _socket
import socket

import pytest
from fetch_paths import (  # noqa: F401 — re-exported for the test modules
    ALLOWLIST_FIXTURES,
    BOMB_FIXTURES,
    OutboundNetworkDenied,
    is_loopback_address,
)


@pytest.fixture(scope="session", autouse=True)
def no_outbound_network() -> object:
    """Disable name resolution entirely and refuse any connect to a non-loopback address."""
    # The C primitives: never patched by anything, so this guard is self-contained.
    real_getaddrinfo = _socket.getaddrinfo
    real_connect = _socket.socket.connect

    # Whatever is installed right now, restored verbatim on teardown — including another module's
    # session-scoped patch, which must not be silently dropped.
    saved = {
        "getaddrinfo": socket.getaddrinfo,
        "connect": socket.socket.connect,
        "create_connection": socket.create_connection,
    }

    def guarded_getaddrinfo(*args: object, **kwargs: object) -> object:
        host = args[0] if args else None
        if is_loopback_address((host, 0)):
            return real_getaddrinfo(*args, **kwargs)  # type: ignore[arg-type]
        raise OutboundNetworkDenied(
            f"socket.getaddrinfo is disabled in the INGF-02 suite (asked for {host!r}); "
            "use ScriptedResolver"
        )

    def guarded_connect(self: socket.socket, address: object) -> object:
        if not is_loopback_address(address):
            raise OutboundNetworkDenied(f"refusing a non-loopback connect to {address!r}")
        return real_connect(self, address)

    def guarded_create_connection(
        address: object,
        timeout: object = socket._GLOBAL_DEFAULT_TIMEOUT,  # type: ignore[attr-defined]
        source_address: object = None,
        *args: object,
        **kwargs: object,
    ) -> socket.socket:
        """A loopback-only `create_connection`, rebuilt from primitives.

        Written out rather than delegated for the reason in the module docstring: the installed
        `socket.create_connection` may be another module's raising stub.
        """
        if not is_loopback_address(address):
            raise OutboundNetworkDenied(f"refusing a non-loopback connect to {address!r}")
        host, port = address[0], address[1]  # type: ignore[index]
        family = socket.AF_INET6 if ":" in str(host) else socket.AF_INET
        sock = socket.socket(family, socket.SOCK_STREAM)
        try:
            if timeout is not socket._GLOBAL_DEFAULT_TIMEOUT:  # type: ignore[attr-defined]
                sock.settimeout(timeout)  # type: ignore[arg-type]
            if source_address:
                sock.bind(source_address)  # type: ignore[arg-type]
            sock.connect((host, port))
        except BaseException:
            sock.close()
            raise
        return sock

    socket.getaddrinfo = guarded_getaddrinfo  # type: ignore[assignment]
    socket.socket.connect = guarded_connect  # type: ignore[method-assign]
    socket.create_connection = guarded_create_connection  # type: ignore[assignment]
    try:
        yield None
    finally:
        socket.getaddrinfo = saved["getaddrinfo"]  # type: ignore[assignment]
        socket.socket.connect = saved["connect"]  # type: ignore[method-assign]
        socket.create_connection = saved["create_connection"]  # type: ignore[assignment]


@pytest.fixture
def fixture_server():
    """A scripted loopback HTTP server, shut down at the end of the test."""
    from fetch_server import FixtureServer

    server = FixtureServer()
    try:
        yield server
    finally:
        server.close()


@pytest.fixture
def fake_resolver():
    """A `ScriptedResolver` with no answers yet — every test scripts its own."""
    from fetch_resolver import ScriptedResolver

    return ScriptedResolver()


@pytest.fixture
def fake_clock():
    """A `FakeClock` whose `sleep` advances the monotonic clock instead of really sleeping."""
    from fetch_clock import FakeClock

    return FakeClock()


@pytest.fixture
def policy_loader():
    """A `DirectoryPolicyLoader` over this suite's synthetic allowlist fixtures."""
    from taxrag_pipeline_ingestion.fetch.policy import DirectoryPolicyLoader

    return DirectoryPolicyLoader(ALLOWLIST_FIXTURES)
