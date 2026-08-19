"""Wiring shared by the fetcher tests: a `SafeFetcher` pointed at the loopback fixture server.

Every fetcher in the suite is built here, so the seam (`allow_loopback_for_tests`), the scripted
resolver and the recording sink are configured in exactly one place — and every limit a test
exercises is a small override, never the production number (R14).
"""

from __future__ import annotations

from typing import Sequence

from fetch_seam import TestFetchLimits

from taxrag_pipeline_ingestion.adapter.types import FetchRequest, FetchValidators
from taxrag_pipeline_ingestion.fetch.client import SafeFetcher
from taxrag_pipeline_ingestion.fetch.observability import FetchEvent

__all__ = ["RecordingSink", "build_fetcher", "request_for"]


class RecordingSink:
    """Keeps every emitted `FetchEvent` so deliverable 9 can be asserted without reading logs."""

    def __init__(self) -> None:
        self.events: list[FetchEvent] = []

    def emit(self, event: FetchEvent) -> None:
        self.events.append(event)


def build_fetcher(
    *,
    policy_loader,
    resolver,
    clock=None,
    sink=None,
    connection_factory=None,
    rng=None,
    **limit_overrides,
) -> SafeFetcher:
    """A `SafeFetcher` with the loopback seam on and any limits the test wants shrunk."""
    limits = TestFetchLimits(**limit_overrides)
    return SafeFetcher(
        policy_loader,
        resolver,
        clock,
        limits,
        connection_factory=connection_factory,
        sink=sink,
        rng=rng,
    )


def request_for(
    url: str,
    group_id: str,
    *,
    method: str = "GET",
    etag: str | None = None,
    last_modified: str | None = None,
    expected_content_types: Sequence[str] = (),
    max_bytes: int | None = None,
) -> FetchRequest:
    return FetchRequest(
        url=url,
        group_id=group_id,
        method=method,  # type: ignore[arg-type]
        validators=FetchValidators(
            etag=etag,
            last_modified=last_modified,
            expected_content_types=tuple(expected_content_types),
            max_bytes=max_bytes,
        ),
    )
