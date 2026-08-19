"""Building INGF-01's `FetchResult`, and the body file's lifetime (INGF-02 deliverable 4).

THE HEADER ALLOWLIST is the whole of what leaves the response. Six keys, lowercased, and nothing
else is copied out — a header set is attacker-controlled text and PRD §22 governs what may travel
into logs and records.

WHY THERE IS NO `FetchResult.close()` (writeback W2). Deliverable 4 says the body file is "deleted
by the caller or by `FetchResult.close()`", but `FetchResult` is INGF-01's frozen, slotted dataclass
and INGF-01's own docstring states that a `close()` and a structured timings type are DELIBERATELY
not declared there. Subclassing to add one was considered and rejected: a dataclass `__eq__`
compares `other.__class__ is self.__class__`, so a subclass instance would compare unequal to an
otherwise identical `FetchResult` and would silently break `INGF-03`'s comparisons. Port fidelity
wins, and the same guarantee is provided by `close_result(result)` plus `SafeFetcher.fetching()`.
Reported on the PR as a wording change to deliverable 4.

`source_artifact_fields()` is the explicit PRD §35.3 mapping the acceptance checklist asks for. It
is a pure projection and stores nothing: `INGF-03` owns persistence, hashing keys and R2.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Sequence

from ..adapter.types import FetchResult

__all__ = [
    "HEADER_ALLOWLIST",
    "FetchTimings",
    "SOURCE_ARTIFACT_FIELDS",
    "build_result",
    "close_result",
    "filter_headers",
    "source_artifact_fields",
]

#: The only response headers that reach the caller (deliverable 4).
HEADER_ALLOWLIST: tuple[str, ...] = (
    "etag",
    "last-modified",
    "content-type",
    "content-length",
    "content-encoding",
    "date",
)

#: The PRD §35.3 `source_artifact` field names this result must be able to fill.
SOURCE_ARTIFACT_FIELDS: tuple[str, ...] = (
    "official_url",
    "retrieved_at",
    "http_status",
    "etag",
    "last_modified",
    "content_type",
    "byte_length",
    "sha256",
)


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchTimings:
    """Per-phase seconds. Fills INGF-01's `timings: Mapping[str, float]` without changing it."""

    dns: float = 0.0
    connect: float = 0.0
    tls: float = 0.0
    ttfb: float = 0.0
    transfer: float = 0.0
    total: float = 0.0

    def as_mapping(self) -> Mapping[str, float]:
        return {
            "dns": self.dns,
            "connect": self.connect,
            "tls": self.tls,
            "ttfb": self.ttfb,
            "transfer": self.transfer,
            "total": self.total,
        }


def filter_headers(headers: Mapping[str, str] | Sequence[tuple[str, str]]) -> Mapping[str, str]:
    """Lowercase and keep only `HEADER_ALLOWLIST` keys."""
    items = headers.items() if hasattr(headers, "items") else headers
    kept: dict[str, str] = {}
    for name, value in items:  # type: ignore[union-attr]
        lowered = str(name).lower()
        if lowered in HEADER_ALLOWLIST:
            kept[lowered] = str(value)
    return kept


def build_result(
    *,
    status_code: int,
    official_url: str,
    final_url: str,
    headers: Mapping[str, str] | Sequence[tuple[str, str]],
    body_path: str | None,
    byte_length: int,
    sha256: str,
    retrieved_at: str,
    redirect_chain: Sequence[str],
    not_modified: bool,
    timings: FetchTimings,
) -> FetchResult:
    """Return INGF-01's exact `FetchResult` — never a subclass (see the module docstring)."""
    return FetchResult(
        status_code=status_code,
        official_url=official_url,
        final_url=final_url,
        headers=filter_headers(headers),
        body_path=body_path,
        byte_length=byte_length,
        sha256=sha256,
        retrieved_at=retrieved_at,
        redirect_chain=tuple(redirect_chain),
        not_modified=not_modified,
        timings=timings.as_mapping(),
    )


def close_result(result: FetchResult) -> None:
    """Delete the result's body file if it still exists. Safe to call more than once."""
    path = result.body_path
    if not path:
        return
    try:
        os.unlink(path)
    except FileNotFoundError:
        return
    except OSError:
        # On Windows a file still open elsewhere cannot be unlinked; the per-fetcher temp directory
        # is removed by `SafeFetcher.close()`, so this is not a leak, only a deferral.
        return


def source_artifact_fields(result: FetchResult) -> Mapping[str, object]:
    """Project *result* onto the PRD §35.3 `source_artifact` names. A projection, not a store."""
    headers = result.headers
    return {
        "official_url": result.official_url,
        "retrieved_at": result.retrieved_at,
        "http_status": result.status_code,
        "etag": headers.get("etag"),
        "last_modified": headers.get("last-modified"),
        "content_type": headers.get("content-type"),
        "byte_length": result.byte_length,
        "sha256": result.sha256,
    }
