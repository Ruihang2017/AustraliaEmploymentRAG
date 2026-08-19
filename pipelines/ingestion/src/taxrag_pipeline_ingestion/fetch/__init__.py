"""The shared safety-checked fetcher (INGF-02; PRD §37.4, §21.1, SEC-002).

PRD §37.4: "Adapters use a shared fetcher, not arbitrary HTTP libraries. Each source has an
allowlisted scheme/domain/path policy. The fetcher resolves DNS and rejects loopback, private,
link-local, multicast and cloud-metadata addresses before and after redirects."

This package is the only place in `pipelines/ingestion/**` allowed to import an HTTP or socket
module; `tests/fetch/test_architecture.py` enforces that with INGF-01's AST scanner.

Importing this package registers the fetch failure codes with INGF-01's registry, so an operator
console that enumerates `failure_code_registry()` sees all 14 before anything has failed.
"""

from __future__ import annotations

from .errors import FetchFailure
from .failures import FETCH_AREA, FETCH_FAILURE_CODES, register_fetch_failure_codes
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

__all__ = [
    "CONNECT_TIMEOUT_SECONDS",
    "FETCH_AREA",
    "FETCH_FAILURE_CODES",
    "FETCH_TIMEOUT_SECONDS",
    "FetchFailure",
    "FetchLimits",
    "FetchLimitsError",
    "MAX_ATTEMPTS",
    "MAX_COMPRESSION_RATIO",
    "MAX_DECOMPRESSED_BYTES",
    "MAX_DOCUMENT_BYTES",
    "MAX_REDIRECTS",
    "READ_TIMEOUT_SECONDS",
]

register_fetch_failure_codes()
