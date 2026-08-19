"""`SafeFetcher` — the `Fetcher` port implementation (INGF-02 deliverables 3, 5, 9).

Per LOGICAL fetch, in this order and with no shortcut for a redirect hop:

1. one `Deadline` for the whole fetch, retries included (PRD §37.4's 30 seconds);
2. the group's allowlist policy is checked on the URL — scheme, host, path prefix, deny paths;
3. DNS is resolved and screened, and the accepted address is PINNED;
4. the connection is opened to that address with the hostname preserved for `Host`, SNI and
   certificate verification;
5. the request is sent with conditional-request headers when the caller supplied validators;
6. the response is STREAMED under a hard byte ceiling and a bounded transport decoder, hashing as
   it goes, and the transfer is ABORTED the moment a ceiling is crossed — never buffered and
   checked afterwards;
7. the declared type is compared with the magic bytes of the first 512 bytes;
8. a redirect repeats steps 2-4 IN FULL before a single byte is sent to the new host.

WHAT IS DELIBERATELY NOT USED. `urllib.request` and any redirect-following opener: this module must
see every hop, and a library that follows redirects for us would fetch first and let us check
afterwards. `http.client` never follows a redirect on its own, which is exactly why it is the
transport here.

RETRY (deliverable 5) wraps steps 2-8 around the SAME `Deadline`, so no number of attempts can
extend the wall clock. Retried: connection errors, timeouts and 429/502/503/504. Never retried: any
policy denial, a type mismatch, a size or decompression breach, a TLS error, or any other 4xx.

THREAD SAFETY (R9). `INGF-08` will drive concurrent fetches through one `SafeFetcher`. All
per-request state is local to `fetch()`; the only instance state is the policy loader's own cache,
the per-fetcher temp directory and the RNG, and the RNG is drawn under a lock because
`random.Random` is not thread-safe.
"""

from __future__ import annotations

import contextlib
import email.utils
import hashlib
import http.client
import random
import shutil
import socket
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator
from urllib.parse import urljoin, urlsplit

from ..adapter.failures import FailureCode
from ..adapter.types import FetchRequest, FetchResult
from .clock import Deadline, FetchClock, fetch_clock_from
from .connection import ConnectionFactory, connection_factory_for
from .decode import ACCEPT_ENCODING, BoundedDecoder
from .errors import FetchFailure
from .ipguard import Resolver, SystemResolver, resolve_and_screen
from .limits import FetchLimits
from .observability import FetchEvent, FetchEventSink, LoggingFetchEventSink
from .policy import AllowlistPolicy, PolicyLoader, effective_max_bytes
from .result import FetchTimings, build_result, close_result
from .sniff import SNIFF_PREFIX_BYTES, check_type

__all__ = ["CHUNK_BYTES", "RETRYABLE_STATUSES", "SafeFetcher", "USER_AGENT"]

#: Identifies the crawler to the source operator. A named constant, never per-adapter text.
USER_AGENT = "taxrag-ingestion/0.1 (+official-source fetcher; contact via source registry)"

#: Streaming granularity. Small enough that an over-size response is aborted promptly.
CHUNK_BYTES = 64 * 1024

#: Statuses deliverable 5 permits a retry on.
RETRYABLE_STATUSES: frozenset[int] = frozenset({429, 502, 503, 504})

#: Statuses that carry a `Location` we may follow.
REDIRECT_STATUSES: frozenset[int] = frozenset({301, 302, 303, 307, 308})

_BACKOFF_BASE_SECONDS = 0.5

_EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()


class SafeFetcher:
    """The shared, safety-checked fetcher (PRD §37.4). Implements INGF-01's `Fetcher` port."""

    def __init__(
        self,
        policy_loader: PolicyLoader,
        resolver: Resolver | None = None,
        clock: object | None = None,
        limits: FetchLimits | None = None,
        *,
        connection_factory: ConnectionFactory | None = None,
        sink: FetchEventSink | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self._policy_loader = policy_loader
        self._resolver: Resolver = resolver or SystemResolver()
        self._limits = limits or FetchLimits()
        self._clock: FetchClock = fetch_clock_from(clock)
        self._connection_factory = connection_factory or connection_factory_for(self._limits)
        self._sink = sink or LoggingFetchEventSink()
        self._rng = rng or random.Random(0x7A11)
        self._lock = threading.Lock()
        self._tempdir: str | None = None

    # -- lifetime ---------------------------------------------------------------------------

    @property
    def limits(self) -> FetchLimits:
        return self._limits

    @property
    def tempdir(self) -> str | None:
        return self._tempdir

    def _ensure_tempdir(self) -> str:
        with self._lock:
            if self._tempdir is None:
                self._tempdir = tempfile.mkdtemp(prefix="taxrag-fetch-")
            return self._tempdir

    def close(self) -> None:
        """Remove the per-fetcher temp directory and everything still in it."""
        with self._lock:
            tempdir, self._tempdir = self._tempdir, None
        if tempdir:
            shutil.rmtree(tempdir, ignore_errors=True)

    def __enter__(self) -> "SafeFetcher":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    @contextlib.contextmanager
    def fetching(self, request: FetchRequest) -> Iterator[FetchResult]:
        """`fetch()` with the body file deleted on exit — writeback W2's replacement for `close()`."""
        result = self.fetch(request)
        try:
            yield result
        finally:
            close_result(result)

    # -- the port ---------------------------------------------------------------------------

    def fetch(self, request: FetchRequest) -> FetchResult:
        """Fetch *request* safely, or raise `FetchFailure` carrying the registered `FailureCode`."""
        if request.method not in ("GET", "HEAD"):
            raise ValueError(f"the shared fetcher permits GET and HEAD only, not {request.method!r}")

        limits = self._limits
        deadline = Deadline(self._clock, limits.fetch_timeout_seconds)
        policy = self._policy_loader.load(request.group_id)

        attempt = 0
        while True:
            attempt += 1
            attempt_started = self._clock.monotonic()
            try:
                result = self._attempt(request, policy, deadline, attempt)
            except FetchFailure as failure:
                duration_ms = int((self._clock.monotonic() - attempt_started) * 1000)
                self._emit(request, failure=failure, attempt=attempt, duration_ms=duration_ms)
                if not self._is_retryable(failure) or attempt >= limits.max_attempts:
                    raise
                delay = self._retry_delay(attempt, failure, deadline)
                if delay is None:
                    # No budget remains for another attempt (or `Retry-After` asked for more time
                    # than the budget has). Re-raise the failure that actually happened rather than
                    # inventing a new code: a timeout must still be reported as FETCH_TIMEOUT, and a
                    # 429/502/503/504 already carries FETCH_TRANSIENT_FAILURE.
                    raise
                self._clock.sleep(delay)
                continue
            duration_ms = int((self._clock.monotonic() - attempt_started) * 1000)
            self._emit(request, result=result, attempt=attempt, duration_ms=duration_ms)
            return result

    # -- one attempt ------------------------------------------------------------------------

    def _attempt(
        self,
        request: FetchRequest,
        policy: AllowlistPolicy,
        deadline: Deadline,
        attempt: int,
    ) -> FetchResult:
        limits = self._limits
        started = self._clock.monotonic()
        url = request.url
        redirect_chain: list[str] = []
        hop = 0
        dns_seconds = 0.0
        connect_seconds = 0.0

        while True:
            decision = policy.check(url, allow_nonstandard_port=limits.allow_loopback_for_tests)
            if not decision.allowed:
                code = decision.code if hop == 0 else FailureCode("FETCH_REDIRECT_DENIED")
                raise FetchFailure(
                    FailureCode(str(code)),
                    decision.reason,
                    details={"hop": hop},
                )

            parts = urlsplit(url)
            host = parts.hostname or ""
            port = parts.port or 443
            if deadline.expired():
                raise FetchFailure(FailureCode("FETCH_TIMEOUT"), "the fetch time budget expired")

            mark = self._clock.monotonic()
            screened = resolve_and_screen(
                host, port, self._resolver, allow_loopback=limits.allow_loopback_for_tests
            )
            dns_seconds += self._clock.monotonic() - mark

            mark = self._clock.monotonic()
            connection = self._connection_factory.open(host, screened[0], deadline, limits)
            connect_seconds += self._clock.monotonic() - mark

            try:
                ttfb_mark = self._clock.monotonic()
                response = self._send(connection, request, parts, deadline)
                ttfb_seconds = self._clock.monotonic() - ttfb_mark
                status = response.status

                if status in REDIRECT_STATUSES:
                    location = response.getheader("Location")
                    if not location:
                        raise FetchFailure(
                            FailureCode("FETCH_HTTP_ERROR"),
                            f"a {status} redirect carried no Location header",
                            details={"status_code": status},
                        )
                    target = urljoin(url, location)
                    target_parts = urlsplit(target)
                    if not target_parts.scheme or not target_parts.netloc:
                        raise FetchFailure(
                            FailureCode("FETCH_HTTP_ERROR"),
                            "the redirect target is not an absolute URL",
                            details={"status_code": status},
                        )
                    hop += 1
                    if hop > limits.max_redirects:
                        raise FetchFailure(
                            FailureCode("FETCH_REDIRECT_LIMIT"),
                            f"more than {limits.max_redirects} redirects",
                            details={"hops": hop},
                        )
                    redirect_chain.append(target)
                    url = target
                    continue  # the `finally` below closes this connection before the next hop

                if status == 304:
                    return build_result(
                        status_code=status,
                        official_url=request.url,
                        final_url=url,
                        headers=response.getheaders(),
                        body_path=None,
                        byte_length=0,
                        sha256=_EMPTY_SHA256,
                        retrieved_at=self._timestamp(),
                        redirect_chain=redirect_chain,
                        not_modified=True,
                        timings=FetchTimings(
                            dns=dns_seconds,
                            connect=connect_seconds,
                            ttfb=ttfb_seconds,
                            total=self._clock.monotonic() - started,
                        ),
                    )

                if status >= 400:
                    raise self._http_failure(status, response)

                body_path, byte_length, sha256, transfer_seconds = self._read_body(
                    connection, response, request, decision.host_rule, deadline
                )
                return build_result(
                    status_code=status,
                    official_url=request.url,
                    final_url=url,
                    headers=response.getheaders(),
                    body_path=body_path,
                    byte_length=byte_length,
                    sha256=sha256,
                    retrieved_at=self._timestamp(),
                    redirect_chain=redirect_chain,
                    not_modified=False,
                    timings=FetchTimings(
                        dns=dns_seconds,
                        connect=connect_seconds,
                        ttfb=ttfb_seconds,
                        transfer=transfer_seconds,
                        total=self._clock.monotonic() - started,
                    ),
                )
            finally:
                # Closing rather than draining is what the fixture server observes as the early
                # disconnect the size-limit acceptance criterion requires.
                connection.close()

    def _send(
        self,
        connection: http.client.HTTPConnection,
        request: FetchRequest,
        parts,
        deadline: Deadline,
    ) -> http.client.HTTPResponse:
        target = parts.path or "/"
        if parts.query:
            target = f"{target}?{parts.query}"
        validators = request.validators
        try:
            connection.putrequest(request.method, target, skip_accept_encoding=True)
            connection.putheader("Accept-Encoding", ACCEPT_ENCODING)
            connection.putheader("User-Agent", USER_AGENT)
            connection.putheader("Accept", "*/*")
            # No cookie header and no authorization header is ever sent on this path.
            if validators.etag:
                connection.putheader("If-None-Match", validators.etag)
            if validators.last_modified:
                connection.putheader("If-Modified-Since", validators.last_modified)
            connection.endheaders()
            self._set_socket_timeout(connection, deadline)
            return connection.getresponse()
        except FetchFailure:
            raise
        except (TimeoutError, socket.timeout) as exc:
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), "the request timed out") from exc
        except (http.client.HTTPException, OSError) as exc:
            raise FetchFailure(
                FailureCode("FETCH_TRANSIENT_FAILURE"),
                f"the request failed: {exc.__class__.__name__}",
            ) from exc

    def _read_body(
        self,
        connection: http.client.HTTPConnection,
        response: http.client.HTTPResponse,
        request: FetchRequest,
        host_rule,
        deadline: Deadline,
    ) -> tuple[str | None, int, str, float]:
        started = self._clock.monotonic()
        limits = self._limits
        validators = request.validators
        ceiling = effective_max_bytes(host_rule, limits, validators.max_bytes)

        declared_length = response.getheader("Content-Length")
        if declared_length is not None:
            try:
                announced = int(declared_length)
            except ValueError:
                announced = None
            if announced is not None and announced > ceiling:
                # Aborted BEFORE a single body byte is read.
                raise FetchFailure(
                    FailureCode("FETCH_SIZE_LIMIT"),
                    f"the declared length {announced} exceeds the ceiling {ceiling}",
                    details={"ceiling": ceiling, "declared_length": announced},
                )

        if request.method == "HEAD":
            return None, 0, _EMPTY_SHA256, self._clock.monotonic() - started

        decoder = BoundedDecoder(
            response.getheader("Content-Encoding"),
            limits.max_decompressed_bytes,
            limits.max_compression_ratio,
        )
        digest = hashlib.sha256()
        prefix = bytearray()
        decoded_total = 0
        raw_total = 0
        type_checked = False
        handle = tempfile.NamedTemporaryFile(
            delete=False, dir=self._ensure_tempdir(), prefix="body-", suffix=".bin"
        )
        path = handle.name
        try:
            while True:
                if deadline.expired():
                    raise FetchFailure(
                        FailureCode("FETCH_TIMEOUT"), "the fetch time budget expired mid-transfer"
                    )
                self._set_socket_timeout(connection, deadline)
                try:
                    chunk = response.read(CHUNK_BYTES)
                except (TimeoutError, socket.timeout) as exc:
                    raise FetchFailure(
                        FailureCode("FETCH_TIMEOUT"), "the transfer timed out"
                    ) from exc
                except (http.client.HTTPException, OSError) as exc:
                    raise FetchFailure(
                        FailureCode("FETCH_TRANSIENT_FAILURE"),
                        f"the transfer failed: {exc.__class__.__name__}",
                    ) from exc
                if not chunk:
                    break

                raw_total += len(chunk)
                if raw_total > ceiling:
                    # The 50 MiB raw ceiling applies to the bytes on the wire as well.
                    raise FetchFailure(
                        FailureCode("FETCH_SIZE_LIMIT"),
                        f"the response exceeded the ceiling of {ceiling} bytes on the wire",
                        details={"ceiling": ceiling},
                    )

                data = decoder.feed(chunk)
                if data:
                    decoded_total += len(data)
                    if decoded_total > ceiling:
                        raise FetchFailure(
                            FailureCode("FETCH_SIZE_LIMIT"),
                            f"the response exceeded the ceiling of {ceiling} bytes",
                            details={"ceiling": ceiling},
                        )
                    digest.update(data)
                    handle.write(data)
                    if len(prefix) < SNIFF_PREFIX_BYTES:
                        prefix.extend(data[: SNIFF_PREFIX_BYTES - len(prefix)])
                    if not type_checked:
                        type_checked = True
                        mismatch = check_type(
                            response.getheader("Content-Type"),
                            bytes(prefix),
                            validators.expected_content_types or (),
                        )
                        if mismatch is not None:
                            raise FetchFailure(
                                mismatch,
                                "the declared content type disagrees with the observed bytes",
                                details={
                                    "declared": response.getheader("Content-Type") or "",
                                },
                            )

            tail = decoder.finish()
            if tail:
                decoded_total += len(tail)
                if decoded_total > ceiling:
                    raise FetchFailure(
                        FailureCode("FETCH_SIZE_LIMIT"),
                        f"the response exceeded the ceiling of {ceiling} bytes",
                        details={"ceiling": ceiling},
                    )
                digest.update(tail)
                handle.write(tail)
        except BaseException:
            handle.close()
            Path(path).unlink(missing_ok=True)
            raise
        handle.close()
        return path, decoded_total, digest.hexdigest(), self._clock.monotonic() - started

    # -- helpers ----------------------------------------------------------------------------

    def _set_socket_timeout(
        self, connection: http.client.HTTPConnection, deadline: Deadline
    ) -> None:
        """Every socket operation is bounded by what is LEFT of the whole-fetch budget."""
        budget = deadline.budget_for_socket(self._limits.read_timeout_seconds)
        if budget <= 0:
            raise FetchFailure(FailureCode("FETCH_TIMEOUT"), "the fetch time budget expired")
        sock = connection.sock
        if sock is not None:
            with contextlib.suppress(OSError):
                sock.settimeout(budget)

    def _http_failure(self, status: int, response: http.client.HTTPResponse) -> FetchFailure:
        details: dict[str, object] = {"status_code": status}
        retry_after = response.getheader("Retry-After")
        if status in RETRYABLE_STATUSES:
            if retry_after:
                details["retry_after"] = retry_after
            return FetchFailure(
                FailureCode("FETCH_TRANSIENT_FAILURE"),
                f"the source returned {status}",
                details=details,
            )
        return FetchFailure(
            FailureCode("FETCH_HTTP_ERROR"), f"the source returned {status}", details=details
        )

    def _is_retryable(self, failure: FetchFailure) -> bool:
        """Retry policy lives HERE and nowhere else (see `errors.py`)."""
        code = str(failure.code)
        if code == "FETCH_TRANSIENT_FAILURE":
            status = failure.details.get("status_code")
            return status is None or status in RETRYABLE_STATUSES
        if code == "FETCH_TIMEOUT":
            return True
        return False

    def _retry_delay(self, attempt: int, failure: FetchFailure, deadline: Deadline) -> float | None:
        """The backoff to sleep before the next attempt, or `None` when no budget remains."""
        remaining = deadline.remaining()
        if remaining <= 0:
            return None
        retry_after = _parse_retry_after(failure.details.get("retry_after"))
        if retry_after is not None:
            # Honoured, but never beyond the budget: a `Retry-After: 3600` on a 30-second budget
            # means give up now, not sleep past the deadline.
            if retry_after >= remaining:
                return None
            return retry_after
        ceiling = _BACKOFF_BASE_SECONDS * (2 ** (attempt - 1))
        with self._lock:
            delay = self._rng.uniform(0.0, ceiling)  # full jitter
        if delay >= remaining:
            return None
        return delay

    def _timestamp(self) -> str:
        moment = self._clock.now()
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

    def _emit(
        self,
        request: FetchRequest,
        *,
        attempt: int,
        duration_ms: int,
        result: FetchResult | None = None,
        failure: FetchFailure | None = None,
    ) -> None:
        event = FetchEvent(
            group_id=request.group_id,
            final_url=result.final_url if result is not None else request.url,
            status=result.status_code if result is not None else None,
            byte_length=result.byte_length if result is not None else 0,
            duration_ms=duration_ms,
            failure_code=str(failure.code) if failure is not None else None,
            attempt=attempt,
        )
        with contextlib.suppress(Exception):
            self._sink.emit(event)


def _parse_retry_after(value: object) -> float | None:
    """`Retry-After` as seconds, from either the delta-seconds or the HTTP-date form."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.isdigit():
        return float(text)
    try:
        when = email.utils.parsedate_to_datetime(text)
    except (TypeError, ValueError):
        return None
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return max(0.0, (when - datetime.now(timezone.utc)).total_seconds())
