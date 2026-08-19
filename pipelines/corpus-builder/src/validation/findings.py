"""The gate `Finding` type and the gate-result aggregate (CRPS-06 deliverable 4).

The ticket declares `Finding = {gate, code, severity: BLOCKING|ANOMALY|INFO, message, subject,
evidence}` and puts it in `gates.py`. It lives in its own module here for one mechanical reason:
`quarantine.py`, `anomalies.py` and `evaluation_report.py` all return findings and are all imported
BY `gates.py`, so a `Finding` defined in `gates.py` would be a circular import. `gates.py` re-exports
it, so `from gates import Finding` — the spelling the ticket implies — works unchanged.

`evidence` is free-form, and that is exactly why it is capped and why the rules below are stated
where a reviewer sees them:

* NO KEY MATERIAL, ever (PRD §20.2) — not a path to a private key, not a signature, not a fragment.
* NO DOCUMENT TEXT (PRD §11.1). A release may contain restricted licensed material, and a gate
  report is written outside the bundle and read by operators; a text excerpt in it would be an
  uncontrolled redistribution. Identifiers, counts, offsets and HASHES are the vocabulary here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from .codes import GATE_CODES, GATE_NAMES, Severity

__all__ = [
    "EVIDENCE_VALUE_MAX_CHARS",
    "Finding",
    "GateResult",
    "blocking",
    "counts_of",
]

#: A single evidence value is truncated past this length. An unbounded free-form member in a file an
#: operator reads is how document text reaches a report by accident.
EVIDENCE_VALUE_MAX_CHARS = 200


def _capped(value: Any) -> Any:
    if isinstance(value, str) and len(value) > EVIDENCE_VALUE_MAX_CHARS:
        return value[:EVIDENCE_VALUE_MAX_CHARS] + "…[truncated]"
    return value


@dataclass(frozen=True)
class Finding:
    """One gate result about one subject.

    Frozen, and its `code` is checked against the closed table at construction: emitting an
    undeclared code raises here rather than producing a report whose vocabulary nothing documents.
    """

    gate: str
    code: str
    severity: Severity
    message: str
    subject: str
    evidence: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.gate not in GATE_NAMES:
            raise ValueError(
                f"{self.gate!r} is not one of the eight PRD §12.2 gates {GATE_NAMES!r}"
            )
        if self.code not in GATE_CODES:
            raise ValueError(
                f"{self.code!r} is not in the closed gate finding table; declare it in "
                "validation/codes.py (and in the CRPS-06 ticket) before emitting it"
            )
        if self.severity not in ("BLOCKING", "ANOMALY", "INFO"):
            raise ValueError(f"{self.severity!r} is not a gate severity")
        object.__setattr__(
            self, "evidence", {key: _capped(value) for key, value in dict(self.evidence).items()}
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate": self.gate,
            "code": self.code,
            "severity": self.severity,
            "message": self.message,
            "subject": self.subject,
            "evidence": dict(self.evidence),
        }


@dataclass(frozen=True)
class GateResult:
    """One gate's outcome. `status` is `PASSED`, `FAILED`, `ANOMALIES` or `NOT_RUN`."""

    gate: str
    status: str
    findings: tuple[Finding, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "gate": self.gate,
            "status": self.status,
            "findings": [finding.to_dict() for finding in self.findings],
        }


def blocking(findings: tuple[Finding, ...] | list[Finding]) -> tuple[Finding, ...]:
    return tuple(finding for finding in findings if finding.severity == "BLOCKING")


def counts_of(findings: tuple[Finding, ...] | list[Finding]) -> tuple[int, int]:
    """`(blocking_count, anomaly_count)` over *findings*."""
    blocking_count = sum(1 for finding in findings if finding.severity == "BLOCKING")
    anomaly_count = sum(1 for finding in findings if finding.severity == "ANOMALY")
    return blocking_count, anomaly_count
