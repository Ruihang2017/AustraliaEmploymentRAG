"""A fake `FetchClock` whose `sleep` advances the monotonic clock instead of really sleeping.

That is what lets `test_limits.py` assert the deliverable 5 property — "the total 30-second budget
covers all attempts of one logical fetch" — deterministically and in milliseconds of real time.
Every sleep is recorded, so the retry test can assert the backoff sequence and the `Retry-After`
clamp rather than merely that the fetch failed.
"""

from __future__ import annotations

import threading
from datetime import datetime, timedelta, timezone

__all__ = ["FakeClock"]


class FakeClock:
    """`now()` is settable, `monotonic()` only ever advances when the test or a sleep says so."""

    def __init__(self, start: datetime | None = None, monotonic: float = 1000.0) -> None:
        self._now = start or datetime(2026, 8, 19, 12, 0, 0, tzinfo=timezone.utc)
        self._monotonic = float(monotonic)
        self._lock = threading.Lock()
        self.sleeps: list[float] = []

    def now(self) -> datetime:
        with self._lock:
            return self._now

    def monotonic(self) -> float:
        with self._lock:
            return self._monotonic

    def sleep(self, seconds: float) -> None:
        with self._lock:
            self.sleeps.append(float(seconds))
        self.advance(seconds)

    def advance(self, seconds: float) -> None:
        with self._lock:
            self._monotonic += float(seconds)
            self._now = self._now + timedelta(seconds=float(seconds))

    @property
    def total_slept(self) -> float:
        with self._lock:
            return sum(self.sleeps)
