"""Time for the fetcher: a monotonic budget plus INGF-01's wall-clock `Clock` (deliverable 3, 5).

INGF-01's `Clock` port offers `now() -> datetime` and nothing else — deliberately, because every
persisted timestamp in the framework is rendered from it (PRD §35.1). The 30-second budget of
PRD §37.4 cannot be measured on a wall clock (an NTP step would extend or collapse it) and a retry
has to sleep, so this module declares the two extra capabilities the fetcher needs WITHOUT editing
INGF-01's port.

`Deadline` is constructed once per **logical** fetch and is shared by every attempt, every retry
sleep and every redirect hop. That is what makes "a retry cannot extend the wall clock"
(deliverable 5) true by construction rather than by convention: there is one budget object and
everything that consumes time asks it how much is left.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

__all__ = ["Deadline", "FetchClock", "SystemFetchClock", "fetch_clock_from"]


@runtime_checkable
class FetchClock(Protocol):
    """Wall clock for timestamps, monotonic clock for budgets, and a sleep for backoff."""

    def now(self) -> datetime: ...

    def monotonic(self) -> float: ...

    def sleep(self, seconds: float) -> None: ...


class SystemFetchClock:
    """The production clock."""

    __slots__ = ()

    def now(self) -> datetime:
        return datetime.now(timezone.utc)

    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)


class _PortClockAdapter:
    """Timestamps from an INGF-01 `Clock`; monotonic and sleep from `time`."""

    __slots__ = ("_port_clock",)

    def __init__(self, port_clock: object) -> None:
        self._port_clock = port_clock

    def now(self) -> datetime:
        return self._port_clock.now()  # type: ignore[attr-defined]

    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)


def fetch_clock_from(clock: object | None) -> FetchClock:
    """Accept a `FetchClock`, an INGF-01 `Clock`, or `None` (the system clock)."""
    if clock is None:
        return SystemFetchClock()
    if hasattr(clock, "monotonic") and hasattr(clock, "sleep"):
        return clock  # type: ignore[return-value]
    return _PortClockAdapter(clock)


class Deadline:
    """The single time budget of one logical fetch (PRD §37.4: 30 seconds, retries included)."""

    __slots__ = ("_clock", "_budget", "_started")

    def __init__(self, clock: FetchClock, budget_seconds: float) -> None:
        self._clock = clock
        self._budget = float(budget_seconds)
        self._started = clock.monotonic()

    @property
    def budget(self) -> float:
        return self._budget

    def elapsed(self) -> float:
        return self._clock.monotonic() - self._started

    def remaining(self) -> float:
        return max(0.0, self._budget - self.elapsed())

    def expired(self) -> bool:
        return self.remaining() <= 0.0

    def budget_for_socket(self, per_operation_seconds: float) -> float:
        """The socket timeout to use now: never more than what is left of the whole budget."""
        return max(0.0, min(self.remaining(), float(per_operation_seconds)))
