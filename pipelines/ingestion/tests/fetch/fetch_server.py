"""A scripted loopback HTTP fixture server (INGF-02 deliverable 10).

Bound to `("127.0.0.1", 0)` — port 0, never a fixed port, because `/start-all` runs several pytest
processes on one machine and a fixed port makes the suite flaky (R8). It is plaintext: no TLS
certificate can be committed here (the CI secret scan rejects a private-key block) or generated
offline, so the fetcher reaches it through the `allow_loopback_for_tests` seam, which permits
plaintext only to a loopback address (writeback W3).

THE REQUEST LOG IS THE EVIDENCE for two acceptance criteria that cannot be proved from the client
side: "a 302 to a denied host issues NO request to that host" (the log for that host is empty) and
"a response above the ceiling is aborted and the server observes an early disconnect" (the log entry
records the mid-body write failure). It is shared across handler threads, so every access takes a
lock and every assertion works on a snapshot (R8).

On Windows a client that aborts mid-body surfaces here as `ConnectionAbortedError` (`WinError
10053`); on Linux as `BrokenPipeError` or `ConnectionResetError`. All three are caught (R11).
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Mapping, Sequence

__all__ = ["FixtureServer", "RecordedRequest", "ScriptedResponse"]


@dataclass
class ScriptedResponse:
    """One scripted reply. A route may hold several; the last one repeats."""

    status: int = 200
    headers: Mapping[str, str] = field(default_factory=dict)
    body: bytes = b""
    #: Seconds to stall BEFORE the status line — used by the timeout case.
    stall_before_headers: float = 0.0
    #: Seconds to stall between body chunks.
    stall_between_chunks: float = 0.0
    chunk_size: int = 8192
    #: Send no `Content-Length` (so the streaming ceiling, not the declared length, must catch it).
    omit_content_length: bool = False


@dataclass
class RecordedRequest:
    """What the server saw. `disconnected` is True when the client aborted mid-body."""

    method: str
    path: str
    host: str
    headers: dict[str, str]
    disconnected: bool = False
    bytes_written: int = 0


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "taxrag-fixture/1.0"

    def log_message(self, fmt: str, *args: object) -> None:  # keep the pytest output readable
        return

    def do_GET(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler's naming
        self._serve(body_allowed=True)

    def do_HEAD(self) -> None:  # noqa: N802
        self._serve(body_allowed=False)

    def _serve(self, *, body_allowed: bool) -> None:
        fixture: FixtureServer = self.server.fixture  # type: ignore[attr-defined]
        headers = {key.lower(): value for key, value in self.headers.items()}
        record = RecordedRequest(
            method=self.command,
            path=self.path,
            host=headers.get("host", ""),
            headers=headers,
        )
        fixture._record(record)

        scripted = fixture._next_response(self.path)
        if scripted is None:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        if scripted.stall_before_headers:
            time.sleep(scripted.stall_before_headers)

        body = scripted.body if body_allowed else b""
        try:
            self.send_response(scripted.status)
            for name, value in scripted.headers.items():
                self.send_header(name, value)
            has_length = any(name.lower() == "content-length" for name in scripted.headers)
            if not has_length and not scripted.omit_content_length and scripted.status != 304:
                self.send_header("Content-Length", str(len(body)))
            if scripted.omit_content_length:
                self.send_header("Connection", "close")
                self.close_connection = True
            self.end_headers()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            fixture._mark_disconnected(record)
            return

        if scripted.status == 304 or not body:
            return

        for start in range(0, len(body), scripted.chunk_size):
            piece = body[start : start + scripted.chunk_size]
            try:
                self.wfile.write(piece)
                self.wfile.flush()
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
                fixture._mark_disconnected(record)
                self.close_connection = True
                return
            record.bytes_written += len(piece)
            if scripted.stall_between_chunks:
                time.sleep(scripted.stall_between_chunks)


class FixtureServer:
    """A scripted, threaded loopback server with a locked request log."""

    def __init__(self) -> None:
        self._routes: dict[str, list[ScriptedResponse]] = {}
        self._log: list[RecordedRequest] = []
        self._lock = threading.Lock()
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self._server.daemon_threads = True
        self._server.fixture = self  # type: ignore[attr-defined]
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    # -- scripting --------------------------------------------------------------------------

    def route(self, path: str, *responses: ScriptedResponse) -> "FixtureServer":
        with self._lock:
            self._routes[path] = list(responses)
        return self

    def _next_response(self, path: str) -> ScriptedResponse | None:
        key = path.split("?", 1)[0]
        with self._lock:
            queued = self._routes.get(key)
            if not queued:
                return None
            return queued.pop(0) if len(queued) > 1 else queued[0]

    # -- the log ----------------------------------------------------------------------------

    def _record(self, record: RecordedRequest) -> None:
        with self._lock:
            self._log.append(record)

    def _mark_disconnected(self, record: RecordedRequest) -> None:
        with self._lock:
            record.disconnected = True

    @property
    def requests(self) -> Sequence[RecordedRequest]:
        """A snapshot — never assert on the live list (R8)."""
        with self._lock:
            return tuple(self._log)

    def requests_for_host(self, host: str) -> Sequence[RecordedRequest]:
        needle = host.lower()
        return tuple(item for item in self.requests if item.host.lower().split(":")[0] == needle)

    def clear(self) -> None:
        with self._lock:
            self._log.clear()

    # -- addressing -------------------------------------------------------------------------

    @property
    def port(self) -> int:
        return int(self._server.server_address[1])

    def url(self, host: str, path: str) -> str:
        """An `https://` URL naming *host* on this server's port.

        The scheme stays `https` because the allowlist policy permits nothing else; only the
        TRANSPORT is plaintext, and only because the screened address is loopback.
        """
        return f"https://{host}:{self.port}{path}"

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)
