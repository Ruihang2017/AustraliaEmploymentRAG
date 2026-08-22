"""The shared safety-checked fetcher (INGF-02; PRD §37.4, §21.1, SEC-002).

PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries. Each source has an
allowlisted scheme/domain/path policy. The fetcher resolves DNS and rejects loopback, private,
link-local, multicast and cloud-metadata addresses before and after redirects."

This package is the only place in `pipelines/ingestion/**` allowed to import an HTTP or socket
module; `tests/fetch/test_architecture.py` enforces that with INGF-01's AST scanner.

Importing this package registers the fetch failure codes with INGF-01's registry, so an operator
console that enumerates `failure_code_registry()` sees all 14 before anything has failed.

The module layout follows the ticket's deliverables: `policy` (1), `ipguard` (2), `client` +
`connection` + `decode` + `sniff` (3), `result` (4), `limits` (6), `failures` (7),
`observability` (9), with `yaml_min` and `clock` as the two dependency-free supports the
environment forced (see their docstrings).
"""

from __future__ import annotations

from .clock import Deadline, FetchClock, SystemFetchClock, fetch_clock_from
from .client import SafeFetcher
from .connection import (
    ConnectionFactory,
    PlaintextLoopbackConnectionFactory,
    TlsPinnedConnectionFactory,
)
from .decode import BoundedDecoder
from .errors import FetchFailure
from .failures import FETCH_AREA, FETCH_FAILURE_CODES, register_fetch_failure_codes
from .ipguard import Resolver, ScreenedAddress, SystemResolver, resolve_and_screen
from .limits import (
    CONNECT_TIMEOUT_SECONDS,
    FETCH_TIMEOUT_SECONDS,
    MAX_ATTEMPTS,
    MAX_COMPRESSION_RATIO,
    MAX_DECOMPRESSED_BYTES,
    MAX_DOCUMENT_BYTES,
    MAX_REDIRECTS,
    READ_TIMEOUT_SECONDS,
    FetchLimits,
    FetchLimitsError,
)
from .observability import FetchEvent, FetchEventSink, LoggingFetchEventSink
from .policy import (
    AllowDecision,
    AllowlistError,
    AllowlistPolicy,
    DirectoryPolicyLoader,
    HostRule,
    PolicyLoader,
    load_allowlist,
)
from .result import (
    HEADER_ALLOWLIST,
    FetchTimings,
    close_result,
    source_artifact_fields,
)

__all__ = [
    "AllowDecision",
    "AllowlistError",
    "AllowlistPolicy",
    "BoundedDecoder",
    "CONNECT_TIMEOUT_SECONDS",
    "ConnectionFactory",
    "Deadline",
    "DirectoryPolicyLoader",
    "FETCH_AREA",
    "FETCH_FAILURE_CODES",
    "FETCH_TIMEOUT_SECONDS",
    "FetchClock",
    "FetchEvent",
    "FetchEventSink",
    "FetchFailure",
    "FetchLimits",
    "FetchLimitsError",
    "FetchTimings",
    "HEADER_ALLOWLIST",
    "HostRule",
    "LoggingFetchEventSink",
    "MAX_ATTEMPTS",
    "MAX_COMPRESSION_RATIO",
    "MAX_DECOMPRESSED_BYTES",
    "MAX_DOCUMENT_BYTES",
    "MAX_REDIRECTS",
    "PlaintextLoopbackConnectionFactory",
    "PolicyLoader",
    "READ_TIMEOUT_SECONDS",
    "Resolver",
    "SafeFetcher",
    "ScreenedAddress",
    "SystemFetchClock",
    "SystemResolver",
    "TlsPinnedConnectionFactory",
    "close_result",
    "fetch_clock_from",
    "load_allowlist",
    "register_fetch_failure_codes",
    "resolve_and_screen",
    "source_artifact_fields",
]

register_fetch_failure_codes()
