"""A scripted resolver — the suite never touches real DNS (deliverable 10).

`ScriptedResolver` answers from a per-host queue. A queue of more than one answer is exactly how the
DNS-rebinding case is built: answer 1 is a public address, answer 2 is `127.0.0.1`. If the fetcher
ever re-resolved between the screen and the connect, it would connect to the second answer — and the
test asserts it did not.

The call log is what proves "no request was issued to that host": a host that was never resolved
cannot have been connected to.
"""

from __future__ import annotations

import socket
import threading
from typing import Sequence

__all__ = ["ScriptedResolver"]


class ScriptedResolver:
    """`resolve(host, port)` pops the next scripted answer for *host* (the last one repeats)."""

    def __init__(self, answers: dict[str, Sequence[Sequence[tuple[int, str]]]] | None = None) -> None:
        self._answers: dict[str, list[list[tuple[int, str]]]] = {}
        self._lock = threading.Lock()
        self.calls: list[tuple[str, int]] = []
        for host, sequence in (answers or {}).items():
            self._answers[host.lower()] = [list(answer) for answer in sequence]

    def add(self, host: str, *answers: Sequence[tuple[int, str]]) -> "ScriptedResolver":
        with self._lock:
            self._answers.setdefault(host.lower(), []).extend(list(answer) for answer in answers)
        return self

    def add_v4(self, host: str, *addresses: str) -> "ScriptedResolver":
        """One answer per address, each a single-address A record."""
        return self.add(host, *[[(socket.AF_INET, address)] for address in addresses])

    def resolve(self, host: str, port: int) -> Sequence[tuple[int, str]]:
        key = host.lower().rstrip(".")
        with self._lock:
            self.calls.append((key, port))
            queued = self._answers.get(key)
            if queued is None:
                raise OSError(f"ScriptedResolver has no answer for {key!r}")
            answer = queued.pop(0) if len(queued) > 1 else queued[0]
        return tuple(answer)

    def call_count(self, host: str) -> int:
        key = host.lower().rstrip(".")
        with self._lock:
            return sum(1 for called, _ in self.calls if called == key)
