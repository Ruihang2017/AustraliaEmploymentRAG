"""Named fetch limits (INGF-02 deliverable 6) — PRD §37.4 **initial defaults**.

PRD §37.4 states them numerically: "Initial defaults: 5 redirects, 30-second fetch timeout, 50 MiB
document limit, 250 MiB safely decompressed limit and declared/observed type agreement." PRD §1
warns that "benchmark-selected parameters are intentionally not fixed until representative corpus
and evaluation results exist", and PRD §45.1 item 5 forbids silently promoting an initial default
into a product rule. They are therefore named constants here, and changing one is a
benchmark-selected configuration change under PRD §45.5 that requires a versioned config record —
not an edit to this file made in passing.

Overriding is possible **only** through an explicit `FetchLimits` value object handed to a
`SafeFetcher`. There is deliberately no process-configuration read of any kind, no module-level
mutation path and no global default object: a security limit that can be lowered from outside the
code is not a limit. `tests/fetch/test_architecture.py` greps this whole package for the two
process-configuration accessor names to keep that true — which is why they are not spelled out
here.

A larger official bulk artifact does NOT get a bigger global default — PRD §37.4 routes it through
the per-source `approved_max_bytes` + `approved_max_bytes_reason` pair in that group's
`allowlist.yaml` (see `policy.py`).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

__all__ = [
    "CONNECT_TIMEOUT_SECONDS",
    "FETCH_TIMEOUT_SECONDS",
    "FetchLimits",
    "FetchLimitsError",
    "MAX_ATTEMPTS",
    "MAX_COMPRESSION_RATIO",
    "MAX_DECOMPRESSED_BYTES",
    "MAX_DOCUMENT_BYTES",
    "MAX_REDIRECTS",
    "READ_TIMEOUT_SECONDS",
]

#: PRD §37.4 initial default — at most 5 redirect hops per logical fetch.
MAX_REDIRECTS: int = 5

#: PRD §37.4 initial default — the total wall-clock budget for one logical fetch, retries included.
FETCH_TIMEOUT_SECONDS: float = 30.0

#: PRD §37.4 initial default — 50 MiB raw document ceiling.
MAX_DOCUMENT_BYTES: int = 50 * 1024**2

#: PRD §37.4 initial default — 250 MiB "safely decompressed" ceiling for transport encodings.
MAX_DECOMPRESSED_BYTES: int = 250 * 1024**2

#: PRD §37.4 decompression-bomb guard: decompressed/compressed ratio ceiling (SEC-002).
MAX_COMPRESSION_RATIO: int = 100

#: PRD §40.7 ("shared framework code performs … retry") — attempts per logical fetch, GET/HEAD only.
MAX_ATTEMPTS: int = 3

#: Socket connect budget; a sub-budget of `FETCH_TIMEOUT_SECONDS`, never additive to it.
CONNECT_TIMEOUT_SECONDS: float = 10.0

#: Per-read socket budget; also a sub-budget of `FETCH_TIMEOUT_SECONDS`.
READ_TIMEOUT_SECONDS: float = 30.0


class FetchLimitsError(ValueError):
    """A `FetchLimits` value is not constructible as asked (deliverable 10)."""


def _repo_root(start: Path) -> Path | None:
    """The directory holding BOTH root manifests, or `None` — INGF-01's two-marker walk.

    Two markers rather than one is what makes this correct inside a `/start-all` git worktree.
    """
    for candidate in [start, *start.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    return None


def _ingestion_tests_dir() -> Path | None:
    root = _repo_root(Path(__file__).resolve())
    if root is None:
        return None
    return root / "pipelines" / "ingestion" / "tests"


def _constructing_frame_file() -> str | None:
    """The `__file__` of the first frame outside this module.

    Frames belonging to this module are skipped rather than counted, because the dataclass-generated
    `__init__` reports THIS module as its `__file__`: a fixed `sys._getframe(n)` depth silently
    breaks whenever the generated code changes shape.
    """
    own_file = __file__
    depth = 1
    while True:
        try:
            frame = sys._getframe(depth)
        except ValueError:
            return None
        candidate = frame.f_globals.get("__file__")
        if candidate != own_file:
            return candidate if isinstance(candidate, str) else None
        depth += 1


def _caller_is_the_ingestion_test_package() -> bool:
    """True when the constructing frame's file lives under `pipelines/ingestion/tests/`."""
    tests_dir = _ingestion_tests_dir()
    if tests_dir is None or not tests_dir.is_dir():
        return False
    caller_file = _constructing_frame_file()
    if caller_file is None:
        return False
    try:
        resolved = Path(caller_file).resolve()
    except OSError:  # pragma: no cover — a synthetic frame with a bogus __file__
        return False
    return resolved.is_relative_to(tests_dir.resolve())


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchLimits:
    """The only override path for the constants above (deliverable 6).

    `allow_loopback_for_tests` is the deliverable-10 test seam and nothing else. It does two things,
    both of which are inert in production because the flag cannot be set there:

    * it lets `ipguard` accept a loopback address, so the offline fixture server on `127.0.0.1` is
      reachable at all;
    * it lets `connection` open a **plaintext** connection, but only when the *screened* address is
      itself loopback. No TLS certificate can be committed to this repository (the secret scan
      rejects a private-key block) or generated offline (`cryptography`/`trustme` are not installed),
      so the offline fixture server cannot speak HTTPS. This is INGF-02 writeback W3; the production
      TLS configuration is asserted directly instead (see `connection.py` and
      `tests/fetch/test_ssrf.py`).

    Setting the flag raises `FetchLimitsError` unless the constructing frame's file lives under
    `pipelines/ingestion/tests/`, which is deliverable 10(a): "only constructible from the test
    package". `tests/fetch/test_limits.py` asserts that a module under `src/` cannot enable it.
    """

    max_redirects: int = MAX_REDIRECTS
    fetch_timeout_seconds: float = FETCH_TIMEOUT_SECONDS
    max_document_bytes: int = MAX_DOCUMENT_BYTES
    max_decompressed_bytes: int = MAX_DECOMPRESSED_BYTES
    max_compression_ratio: int = MAX_COMPRESSION_RATIO
    max_attempts: int = MAX_ATTEMPTS
    connect_timeout_seconds: float = CONNECT_TIMEOUT_SECONDS
    read_timeout_seconds: float = READ_TIMEOUT_SECONDS
    allow_loopback_for_tests: bool = False

    def __post_init__(self) -> None:
        if self.max_redirects < 0:
            raise FetchLimitsError("max_redirects must not be negative")
        for name in (
            "fetch_timeout_seconds",
            "max_document_bytes",
            "max_decompressed_bytes",
            "max_compression_ratio",
            "max_attempts",
            "connect_timeout_seconds",
            "read_timeout_seconds",
        ):
            if getattr(self, name) <= 0:
                raise FetchLimitsError(f"{name} must be greater than zero")
        if self.allow_loopback_for_tests and not _caller_is_the_ingestion_test_package():
            raise FetchLimitsError(
                "allow_loopback_for_tests is the INGF-02 deliverable 10 test seam and is only "
                "constructible from pipelines/ingestion/tests/"
            )
