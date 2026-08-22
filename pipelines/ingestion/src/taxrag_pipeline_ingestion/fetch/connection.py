"""Connect to a PINNED, screened address with the hostname preserved (deliverable 3 steps 2-3).

PRD §21.1 requires "DNS-rebinding protection". The defence here is structural rather than
procedural: there is no code path in this package that hands a hostname to the socket layer. The
address the IP guard screened is the address the TCP connection goes to, and the hostname is kept
only for the things that must stay bound to it — the `Host` header, the TLS SNI value and the
certificate hostname check.

The mechanism is the standard library's own documented test seam. `http.client.HTTPConnection`
sets, in `__init__`:

    self._create_connection = socket.create_connection   # "stored as an instance variable to
                                                         #  allow unit tests to replace it"

and `HTTPSConnection.connect()` calls `super().connect()` and then
`self._context.wrap_socket(self.sock, server_hostname=self.host)`. Replacing `_create_connection`
therefore redirects only the TCP destination; SNI, `Host` and hostname verification all still use
`self.host`. After connecting, `getpeername()` is asserted against the pinned address — so even a
future standard-library change cannot silently reintroduce connect-by-name.

TLS IS NEVER RELAXED. The context is `ssl.create_default_context()` — hostname checking on,
certificates required — with a TLS 1.2 floor. `test_architecture.py` asserts that none of the four
usual verification-disabling incantations appears anywhere in this package, which is why this
docstring describes them rather than quoting them: a guard whose own wording trips it is a guard
somebody deletes.

THE PLAINTEXT LOOPBACK FACTORY is the deliverable 10 seam and INGF-02 writeback W3. No TLS
certificate can be committed to this repository (the CI secret scan rejects a private-key block) or
generated offline (`cryptography`/`trustme` are not installed), so the offline fixture server cannot
speak HTTPS. `PlaintextLoopbackConnectionFactory` refuses to open anything that is not a loopback
address, and is only reachable when `FetchLimits.allow_loopback_for_tests` is set — which is itself
only constructible from `pipelines/ingestion/tests/`.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
from typing import Protocol

from ..adapter.failures import FailureCode
from .clock import Deadline
from .errors import FetchFailure
from .ipguard import ScreenedAddress
from .limits import FetchLimits

__all__ = [
    "ConnectionFactory",
    "PlaintextLoopbackConnectionFactory",
    "TlsPinnedConnectionFactory",
    "connection_factory_for",
    "tls_context",
]


class ConnectionFactory(Protocol):
    """Opens one connection to an already-screened address."""

    def open(
        self,
        host: str,
        screened: ScreenedAddress,
        deadline: Deadline,
        limits: FetchLimits,
    ) -> http.client.HTTPConnection: ...


def tls_context() -> ssl.SSLContext:
    """The one TLS configuration this package uses: verified, hostname-checked, TLS 1.2 floor."""
    context = ssl.create_default_context()
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    return context


def _pin(connection: http.client.HTTPConnection, screened: ScreenedAddress) -> None:
    """Redirect only the TCP destination; everything hostname-bound stays bound to the hostname."""

    def create_connection(address, timeout, source_address=None, *args, **kwargs):
        return socket.create_connection((screened.address, address[1]), timeout, source_address)

    connection._create_connection = create_connection  # type: ignore[attr-defined]


def _assert_peer(connection: http.client.HTTPConnection, screened: ScreenedAddress) -> None:
    sock = connection.sock
    peer = sock.getpeername() if sock is not None else None
    peer_address = peer[0] if isinstance(peer, tuple) and peer else None
    if peer_address is None or ipaddress.ip_address(peer_address) != ipaddress.ip_address(
        screened.address
    ):
        try:
            connection.close()
        finally:
            raise FetchFailure(
                FailureCode("FETCH_DENIED_IP"),
                "the connected peer is not the screened address",
                details={"rule": "peer-address-mismatch"},
            )


class TlsPinnedConnectionFactory:
    """The production factory: HTTPS to the pinned address, verified against the hostname."""

    __slots__ = ()

    def open(
        self,
        host: str,
        screened: ScreenedAddress,
        deadline: Deadline,
        limits: FetchLimits,
    ) -> http.client.HTTPConnection:
        timeout = deadline.budget_for_socket(limits.connect_timeout_seconds)
        if timeout <= 0:
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), "the time budget expired before connect")
        connection = http.client.HTTPSConnection(
            host, screened.port, timeout=timeout, context=tls_context()
        )
        _pin(connection, screened)
        try:
            connection.connect()
        except ssl.SSLError as exc:
            connection.close()
            raise FetchFailure(
                FailureCode("FETCH_TLS_ERROR"),
                f"TLS verification failed for {host}: {exc.__class__.__name__}",
            ) from exc
        except (TimeoutError, socket.timeout) as exc:
            connection.close()
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), f"connect to {host} timed out") from exc
        except OSError as exc:
            connection.close()
            raise FetchFailure(
                FailureCode("FETCH_TRANSIENT_FAILURE"),
                f"connect to {host} failed: {exc.__class__.__name__}",
            ) from exc
        _assert_peer(connection, screened)
        return connection


class PlaintextLoopbackConnectionFactory:
    """The offline test seam: plaintext, and ONLY to a loopback address (writeback W3)."""

    __slots__ = ()

    def open(
        self,
        host: str,
        screened: ScreenedAddress,
        deadline: Deadline,
        limits: FetchLimits,
    ) -> http.client.HTTPConnection:
        if not limits.allow_loopback_for_tests:
            raise FetchFailure(
                FailureCode("FETCH_TLS_ERROR"),
                "a plaintext connection is only permitted under the test seam",
            )
        if not ipaddress.ip_address(screened.address).is_loopback:
            raise FetchFailure(
                FailureCode("FETCH_TLS_ERROR"),
                "the plaintext test seam refuses a non-loopback address",
            )
        timeout = deadline.budget_for_socket(limits.connect_timeout_seconds)
        if timeout <= 0:
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), "the time budget expired before connect")
        connection = http.client.HTTPConnection(host, screened.port, timeout=timeout)
        _pin(connection, screened)
        try:
            connection.connect()
        except (TimeoutError, socket.timeout) as exc:
            connection.close()
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), f"connect to {host} timed out") from exc
        except OSError as exc:
            connection.close()
            raise FetchFailure(
                FailureCode("FETCH_TRANSIENT_FAILURE"),
                f"connect to {host} failed: {exc.__class__.__name__}",
            ) from exc
        _assert_peer(connection, screened)
        return connection


def connection_factory_for(limits: FetchLimits) -> ConnectionFactory:
    """The production factory always, except under the explicitly enabled loopback test seam."""
    if limits.allow_loopback_for_tests:
        return PlaintextLoopbackConnectionFactory()
    return TlsPinnedConnectionFactory()
