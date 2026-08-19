"""The failure channel of the shared fetcher (INGF-02 writeback W1).

The `Fetcher` port declared by INGF-01 is `fetch(request) -> FetchResult`, and `FetchResult` is a
frozen, slotted dataclass with **no** failure field. INGF-02's deliverables 3 and 7 nonetheless
require every denial and every limit breach to reach the caller as a `FailureCode`. The only channel
that does not require editing INGF-01's file is an exception, so that is what this is — reported as
writeback W1 on the PR: if the module owner prefers a result-shaped channel, deliverable 3 and
INGF-01's `FetchResult` both change, and this module goes away.

`details` is deliberately a small, bounded mapping (a status code, a denial rule name, a byte
count). It never carries response bytes, a full header set or credentials — PRD §22 governs what may
appear on this path, and a failure object is logged and quarantined by `INGF-05`.

There is deliberately **no** `is_retryable` property here. Retry policy is keyed on the code *and*
the HTTP status *and* the remaining time budget, so it lives in exactly one place, `client.py`.
Two places would eventually disagree, and the disagreement would be a silently-retried policy
denial.
"""

from __future__ import annotations

from typing import Mapping

from ..adapter.failures import FailureCode

__all__ = ["FetchFailure"]


class FetchFailure(Exception):
    """A fetch was refused or aborted; `code` is the registered `FailureCode`."""

    __slots__ = ("code", "message", "details")

    def __init__(
        self,
        code: FailureCode | str,
        message: str,
        *,
        details: Mapping[str, object] | None = None,
    ) -> None:
        self.code: FailureCode = FailureCode(str(code))
        self.message = message
        self.details: Mapping[str, object] = dict(details or {})
        super().__init__(f"{self.code}: {message}")

    def __repr__(self) -> str:  # pragma: no cover — diagnostics only
        return f"FetchFailure({self.code!r}, {self.message!r}, details={dict(self.details)!r})"
