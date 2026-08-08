"""Auditable reason codes and rule ids (CRPS-04 deliverable 8).

Every `TierDecision` carries one reason code and one rule id, so an operator can answer "why is this
chunk not embedded?" from data alone (PRD §12.1 customer-visible source metadata; `ADM-001`
internal visibility). Each code is an exported constant with a docstring naming its PRD basis, and
`REASON_BASIS` makes that basis machine-readable so the criterion is testable rather than eyeballed.
"""

from __future__ import annotations

from collections.abc import Mapping
from types import MappingProxyType
from typing import Final

__all__ = [
    "REASON_BASIS",
    "REASON_CODES",
    "REASON_LICENCE_NO_EMBEDDING",
    "REASON_LICENCE_NO_INDEXING",
    "REASON_LICENCE_NO_STORAGE",
    "REASON_LICENCE_PROHIBITED",
    "REASON_LICENCE_UNCLEAR_DEFAULT_METADATA",
    "REASON_NON_EVIDENCE_STRUCTURAL",
    "REASON_QUARANTINE_OPEN",
    "REASON_SOURCE_INITIAL_TIER",
    "RULE_IDS",
    "RULE_LICENCE_EXCLUDED",
    "RULE_LICENCE_METADATA_ONLY",
    "RULE_LICENCE_NO_EMBEDDING_CAP",
    "RULE_NON_EVIDENCE_STRUCTURAL",
    "RULE_QUARANTINE_OPEN",
    "RULE_SOURCE_INITIAL_TIER",
]

REASON_QUARANTINE_OPEN: Final[str] = "QUARANTINE_OPEN"
"""PRD §35.3 `quarantine_item`: an open item "cannot enter promoted release while open"."""

REASON_LICENCE_PROHIBITED: Final[str] = "LICENCE_PROHIBITED"
"""PRD §11.1: the licence assessment state is `PROHIBITED`."""

REASON_LICENCE_NO_STORAGE: Final[str] = "LICENCE_NO_STORAGE"
"""PRD §11.1: the assessment's independent *storage* decision is False."""

REASON_LICENCE_UNCLEAR_DEFAULT_METADATA: Final[str] = "LICENCE_UNCLEAR_DEFAULT_METADATA"
"""PRD §11.1: "Unclear rights default to metadata, limited quotation and official links."."""

REASON_LICENCE_NO_INDEXING: Final[str] = "LICENCE_NO_INDEXING"
"""PRD §11.1: the assessment's independent *indexing* decision is False."""

REASON_LICENCE_NO_EMBEDDING: Final[str] = "LICENCE_NO_EMBEDDING"
"""PRD §11.1 lists embedding as an independent decision; PRD §40.1 "Licensing can only reduce
permitted display/indexing" — dense indexing is off, lexical/metadata coverage remains."""

REASON_SOURCE_INITIAL_TIER: Final[str] = "SOURCE_INITIAL_TIER"
"""PRD §40.1: the source group's initial tier applies unchanged."""

REASON_NON_EVIDENCE_STRUCTURAL: Final[str] = "NON_EVIDENCE_STRUCTURAL"
"""PRD §17.2 "Tier 3 no default embedding" / "Embedding eviction MUST NOT remove legal evidence":
non-evidence-bearing structural material may be reduced by one tier, never below Tier 3."""


REASON_BASIS: Mapping[str, str] = MappingProxyType(
    {
        REASON_QUARANTINE_OPEN: (
            "PRD §35.3 quarantine_item: cannot enter promoted release while open."
        ),
        REASON_LICENCE_PROHIBITED: "PRD §11.1: licence assessment state PROHIBITED.",
        REASON_LICENCE_NO_STORAGE: (
            "PRD §11.1: the independently stated storage decision is refused."
        ),
        REASON_LICENCE_UNCLEAR_DEFAULT_METADATA: (
            "PRD §11.1: unclear rights default to metadata, limited quotation and official links."
        ),
        REASON_LICENCE_NO_INDEXING: (
            "PRD §11.1: the independently stated indexing decision is refused."
        ),
        REASON_LICENCE_NO_EMBEDDING: (
            "PRD §11.1 / §40.1: the independently stated embedding decision is refused; "
            "licensing may only reduce permitted indexing, and lexical coverage is kept."
        ),
        REASON_SOURCE_INITIAL_TIER: "PRD §40.1: the source group's initial tier applies.",
        REASON_NON_EVIDENCE_STRUCTURAL: (
            "PRD §17.2: non-evidence-bearing structural material may drop one tier, floored at "
            "Tier 3; evidence-bearing text is never reduced."
        ),
    }
)
"""`reason_code -> the PRD sentence it rests on`. Asserted complete by the test suite."""

REASON_CODES: frozenset[str] = frozenset(REASON_BASIS)
"""The closed set every `TierDecision.reason_code` is drawn from."""


RULE_QUARANTINE_OPEN: Final[str] = "R1_QUARANTINE_OPEN"
"""Precedence step 1 (CRPS-04 deliverable 3.1)."""

RULE_LICENCE_EXCLUDED: Final[str] = "R2_LICENCE_EXCLUDED"
"""Precedence step 2 (deliverable 3.2)."""

RULE_LICENCE_METADATA_ONLY: Final[str] = "R3_LICENCE_METADATA_ONLY"
"""Precedence step 3 (deliverable 3.3)."""

RULE_LICENCE_NO_EMBEDDING_CAP: Final[str] = "R4_LICENCE_NO_EMBEDDING_CAP"
"""Precedence step 4 (deliverable 3.4) — a CAP, not a terminal rule."""

RULE_SOURCE_INITIAL_TIER: Final[str] = "R5_SOURCE_INITIAL_TIER"
"""Precedence step 5 (deliverable 3.5)."""

RULE_NON_EVIDENCE_STRUCTURAL: Final[str] = "R6_NON_EVIDENCE_STRUCTURAL"
"""Precedence step 6 (deliverable 3.6)."""

RULE_IDS: frozenset[str] = frozenset(
    {
        RULE_QUARANTINE_OPEN,
        RULE_LICENCE_EXCLUDED,
        RULE_LICENCE_METADATA_ONLY,
        RULE_LICENCE_NO_EMBEDDING_CAP,
        RULE_SOURCE_INITIAL_TIER,
        RULE_NON_EVIDENCE_STRUCTURAL,
    }
)
"""The closed set every `TierDecision.applied_rule` is drawn from."""
