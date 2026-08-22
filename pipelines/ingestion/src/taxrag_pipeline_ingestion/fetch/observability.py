"""The bounded per-attempt fetch record (INGF-02 deliverable 9; PRD §22).

Deliverable 9: "every attempt emits a bounded structured record (`group_id`, `final_url`, `status`,
`byte_length`, `duration_ms`, `failure_code`, `attempt`) and nothing else." The field set is
therefore closed, and a test asserts it is exactly those seven names — the enforcement has to be
structural, because "and nothing else" is the kind of rule that erodes one convenient extra field at
a time.

Official source URLs are public and permitted on this path (PRD §22). Research/evidence content,
PII, credentials and provider payloads are forbidden — none of them exist here, and none can be
added without changing this dataclass and failing that test.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass
from typing import Mapping, Protocol

__all__ = ["FETCH_EVENT_FIELDS", "FetchEvent", "FetchEventSink", "LoggingFetchEventSink"]

#: Exactly the seven fields deliverable 9 permits.
FETCH_EVENT_FIELDS: tuple[str, ...] = (
    "group_id",
    "final_url",
    "status",
    "byte_length",
    "duration_ms",
    "failure_code",
    "attempt",
)


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchEvent:
    """One attempt of one logical fetch."""

    group_id: str
    final_url: str
    status: int | None
    byte_length: int
    duration_ms: int
    failure_code: str | None
    attempt: int

    def as_mapping(self) -> Mapping[str, object]:
        return asdict(self)


class FetchEventSink(Protocol):
    """Where fetch events go. Injectable so a test can assert on them without reading logs."""

    def emit(self, event: FetchEvent) -> None: ...


class LoggingFetchEventSink:
    """The default sink: one structured `logging` record per attempt, fields as `extra`."""

    __slots__ = ("_logger",)

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or logging.getLogger("taxrag.ingestion.fetch")

    def emit(self, event: FetchEvent) -> None:
        self._logger.info(
            "fetch attempt %s for %s: %s",
            event.attempt,
            event.group_id,
            event.failure_code or event.status,
            extra={"fetch_event": dict(event.as_mapping())},
        )
