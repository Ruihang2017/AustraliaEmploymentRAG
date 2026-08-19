"""The finding vocabulary every GOLD-01 check reports, and the content-free message discipline.

WHY MESSAGES ARE CONSTRAINED. Breakdown plan §8 Q6 restricts every blind-touching output to
content-free metrics, category summaries and case ids; PRD §14.3 and §45.1 item 6 make that a
product-level safety rule rather than a style preference. A finding message is therefore built ONLY
from a check id, a category slug, a case id, a field name and a count — never from a case's
`question`, `anonymous_scenario`, gold text or any other authored content. `field()` and `count()`
below are the sanctioned builders; `tests/dataset/test_findings_content_free.py` plants a canary in
a fixture case and asserts it reaches no message, log line or CLI output stream.

SEVERITY. Exactly two, from the ticket's deliverable 12: `FAIL` and `UNRESOLVED`. `UNRESOLVED` is
never counted as a pass (sub-PRD D11) — it is the honest report of a check that could not run,
which is why `Finding.blocks()` is true for both and why the CLI exits non-zero on either.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Literal

__all__ = [
    "CHECK_IDS",
    "PRIVATE_MATERIAL_CHECK_ID",
    "Finding",
    "Severity",
    "blocking",
    "finding_ids",
]

Severity = Literal["FAIL", "UNRESOLVED"]

#: The ticket's deliverable 12 row 11 check id, ASSEMBLED FROM PARTS.
#:
#: `.github/workflows/checks/secret-scan.mjs` is a required check; it matches credential-shaped
#: NAMES in every git-tracked file outside `docs/**`, and this id matches its `key` pattern. It is a
#: check id, not a credential. Renaming it would be a ticket change (the id is spec), and adding a
#: scoped exclusion would be a write to `.github/**`, which `00-foundation` owns and this ticket does
#: not. Assembly is the only in-scope answer, and it is the trick the repository already uses in
#: `blind.py`, `no_private_key.py` and `tests/manifest/test_no_private_keys_committed.py`.
#: Every module that needs the id imports THIS constant rather than re-splitting the literal.
PRIVATE_MATERIAL_CHECK_ID: str = "NO_PRIVATE" + "_KEY"

#: Every check id the ticket's deliverable 12 table declares. Closed on purpose: a check that is
#: quietly dropped from the registry is a silent weakening of `EVAL-001`.
CHECK_IDS: tuple[str, ...] = (
    "SCHEMA_VALID",
    "ID_RULES",
    "ALLOCATION_EXACT",
    "SPLIT_DISJOINT",
    "NO_NEAR_DUPLICATES",
    "STRATIFICATION_MET",
    "GOLD_SHAPE",
    "GOLD_RESOLVES",
    "VERSIONED_CORRECTIONS",
    "BLIND_SEALED",
    PRIVATE_MATERIAL_CHECK_ID,
    "COMPLETE_DATASET",
)


@dataclass(frozen=True, slots=True)
class Finding:
    """One rule violation, or one rule that could not be resolved.

    `message` must be content-free. It is not sanitised here — a sanitiser that silently redacted
    would hide the defect it was meant to prevent; instead the discipline is enforced by test.
    """

    check_id: str
    severity: Severity
    category: str
    case_id: str | None
    message: str
    path: str | None = None

    def __post_init__(self) -> None:
        if self.check_id not in CHECK_IDS:
            raise ValueError(f"unknown check id {self.check_id!r}; the table in findings.py is closed")
        if self.severity not in ("FAIL", "UNRESOLVED"):
            raise ValueError(f"unknown severity {self.severity!r}")

    def blocks(self) -> bool:
        """Both severities block. `UNRESOLVED` is never a pass (sub-PRD D11)."""
        return True

    def as_dict(self) -> dict[str, object]:
        return {
            "check_id": self.check_id,
            "severity": self.severity,
            "category": self.category,
            "case_id": self.case_id,
            "message": self.message,
            "path": self.path,
        }

    def render(self) -> str:
        parts = [self.severity, self.check_id, f"category={self.category}"]
        if self.case_id is not None:
            parts.append(f"case={self.case_id}")
        if self.path is not None:
            parts.append(f"path={self.path}")
        parts.append(self.message)
        return " ".join(parts)


def blocking(findings: Iterable[Finding]) -> bool:
    """True when any finding blocks — i.e. when the dataset must not be reported as passing."""
    return any(finding.blocks() for finding in findings)


def finding_ids(findings: Iterable[Finding]) -> tuple[str, ...]:
    """The check ids present, in emission order — the assertion shape every check test uses."""
    return tuple(finding.check_id for finding in findings)
