"""The 72-row decision table — CRPS-04 acceptance item 1 (PRD §17.2, §11.1, §40.1).

Every combination of (3 initial tiers x 6 licence states x 2 quarantine states x 2 evidence flags)
is written out below as LITERAL DATA. The table is the specification: nothing here is computed from
the implementation, and if the implementation changes the table must be edited deliberately.

The three `licence_permits_*` decisions are held at `True` in every row on purpose. PRD §11.1
requires storage / indexing / embedding to be stated independently of the status, so a table that
varied them alongside the status could not distinguish "the status decided this" from "a permit
decision decided this" — the exact inference §11.1 forbids. They are exercised on their own in
`test_tier_precedence.py`.
"""

from __future__ import annotations

import pytest
from conftest import MAPPED, make_input
from tiering import (
    REASON_LICENCE_PROHIBITED,
    REASON_LICENCE_UNCLEAR_DEFAULT_METADATA,
    REASON_NON_EVIDENCE_STRUCTURAL,
    REASON_QUARANTINE_OPEN,
    REASON_SOURCE_INITIAL_TIER,
    RULE_LICENCE_EXCLUDED,
    RULE_LICENCE_METADATA_ONLY,
    RULE_NON_EVIDENCE_STRUCTURAL,
    RULE_QUARANTINE_OPEN,
    RULE_SOURCE_INITIAL_TIER,
    IndexTier,
    LicenceStatus,
    assign_tier,
)

_T1 = IndexTier.TIER_1_FULL_SEMANTIC
_T2 = IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC
_T3 = IndexTier.TIER_3_METADATA_AND_ON_DEMAND
_EXCL = IndexTier.EXCLUDED_LICENSING
_QUAR = IndexTier.QUARANTINED_QUALITY

_PERM = LicenceStatus.PERMITTED
_ATTR = LicenceStatus.PERMITTED_WITH_ATTRIBUTION
_META = LicenceStatus.METADATA_AND_LINK_ONLY
_UNCL = LicenceStatus.UNCLEAR_RESTRICTED
_PROH = LicenceStatus.PROHIBITED
_REVW = LicenceStatus.REVIEW_REQUIRED

_R1 = RULE_QUARANTINE_OPEN
_R2 = RULE_LICENCE_EXCLUDED
_R3 = RULE_LICENCE_METADATA_ONLY
_R5 = RULE_SOURCE_INITIAL_TIER
_R6 = RULE_NON_EVIDENCE_STRUCTURAL

_QO = REASON_QUARANTINE_OPEN
_PR = REASON_LICENCE_PROHIBITED
_UM = REASON_LICENCE_UNCLEAR_DEFAULT_METADATA
_SI = REASON_SOURCE_INITIAL_TIER
_NE = REASON_NON_EVIDENCE_STRUCTURAL

# (initial, status, quarantine_open, is_evidence_bearing, tier, reason, rule, downgraded_from)
DECISION_TABLE: list[
    tuple[str, LicenceStatus, bool, bool, IndexTier, str, str, IndexTier | None]
] = [
    # ------------------------------------------------------------------ rule 1: quarantine (36)
    # An open quarantine item cannot enter a promoted release (PRD §35.3) — it dominates every
    # other input, including a T1 + PERMITTED source with every permit granted.
    ("T1", _PERM, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _PERM, True, False, _QUAR, _QO, _R1, _T1),
    ("T1", _ATTR, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _ATTR, True, False, _QUAR, _QO, _R1, _T1),
    ("T1", _META, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _META, True, False, _QUAR, _QO, _R1, _T1),
    ("T1", _UNCL, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _UNCL, True, False, _QUAR, _QO, _R1, _T1),
    ("T1", _PROH, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _PROH, True, False, _QUAR, _QO, _R1, _T1),
    ("T1", _REVW, True, True, _QUAR, _QO, _R1, _T1),
    ("T1", _REVW, True, False, _QUAR, _QO, _R1, _T1),
    ("T2", _PERM, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _PERM, True, False, _QUAR, _QO, _R1, _T2),
    ("T2", _ATTR, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _ATTR, True, False, _QUAR, _QO, _R1, _T2),
    ("T2", _META, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _META, True, False, _QUAR, _QO, _R1, _T2),
    ("T2", _UNCL, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _UNCL, True, False, _QUAR, _QO, _R1, _T2),
    ("T2", _PROH, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _PROH, True, False, _QUAR, _QO, _R1, _T2),
    ("T2", _REVW, True, True, _QUAR, _QO, _R1, _T2),
    ("T2", _REVW, True, False, _QUAR, _QO, _R1, _T2),
    ("T3", _PERM, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _PERM, True, False, _QUAR, _QO, _R1, _T3),
    ("T3", _ATTR, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _ATTR, True, False, _QUAR, _QO, _R1, _T3),
    ("T3", _META, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _META, True, False, _QUAR, _QO, _R1, _T3),
    ("T3", _UNCL, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _UNCL, True, False, _QUAR, _QO, _R1, _T3),
    ("T3", _PROH, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _PROH, True, False, _QUAR, _QO, _R1, _T3),
    ("T3", _REVW, True, True, _QUAR, _QO, _R1, _T3),
    ("T3", _REVW, True, False, _QUAR, _QO, _R1, _T3),
    # ---------------------------------------------------- not quarantined, initial tier T1 (12)
    ("T1", _PERM, False, True, _T1, _SI, _R5, None),
    ("T1", _PERM, False, False, _T2, _NE, _R6, _T1),
    ("T1", _ATTR, False, True, _T1, _SI, _R5, None),
    ("T1", _ATTR, False, False, _T2, _NE, _R6, _T1),
    ("T1", _META, False, True, _T3, _UM, _R3, _T1),
    ("T1", _META, False, False, _T3, _UM, _R3, _T1),
    ("T1", _UNCL, False, True, _T3, _UM, _R3, _T1),
    ("T1", _UNCL, False, False, _T3, _UM, _R3, _T1),
    ("T1", _PROH, False, True, _EXCL, _PR, _R2, _T1),
    ("T1", _PROH, False, False, _EXCL, _PR, _R2, _T1),
    ("T1", _REVW, False, True, _T3, _UM, _R3, _T1),
    ("T1", _REVW, False, False, _T3, _UM, _R3, _T1),
    # ---------------------------------------------------- not quarantined, initial tier T2 (12)
    ("T2", _PERM, False, True, _T2, _SI, _R5, None),
    ("T2", _PERM, False, False, _T3, _NE, _R6, _T2),
    ("T2", _ATTR, False, True, _T2, _SI, _R5, None),
    ("T2", _ATTR, False, False, _T3, _NE, _R6, _T2),
    ("T2", _META, False, True, _T3, _UM, _R3, _T2),
    ("T2", _META, False, False, _T3, _UM, _R3, _T2),
    ("T2", _UNCL, False, True, _T3, _UM, _R3, _T2),
    ("T2", _UNCL, False, False, _T3, _UM, _R3, _T2),
    ("T2", _PROH, False, True, _EXCL, _PR, _R2, _T2),
    ("T2", _PROH, False, False, _EXCL, _PR, _R2, _T2),
    ("T2", _REVW, False, True, _T3, _UM, _R3, _T2),
    ("T2", _REVW, False, False, _T3, _UM, _R3, _T2),
    # ---------------------------------------------------- not quarantined, initial tier T3 (12)
    # Tier 3 is the floor of rules 3 and 6, so those rules FIRE without a downgrade: the reason
    # records why, and `downgraded_from` stays None because nothing moved.
    ("T3", _PERM, False, True, _T3, _SI, _R5, None),
    ("T3", _PERM, False, False, _T3, _SI, _R5, None),
    ("T3", _ATTR, False, True, _T3, _SI, _R5, None),
    ("T3", _ATTR, False, False, _T3, _SI, _R5, None),
    ("T3", _META, False, True, _T3, _UM, _R3, None),
    ("T3", _META, False, False, _T3, _UM, _R3, None),
    ("T3", _UNCL, False, True, _T3, _UM, _R3, None),
    ("T3", _UNCL, False, False, _T3, _UM, _R3, None),
    ("T3", _PROH, False, True, _EXCL, _PR, _R2, _T3),
    ("T3", _PROH, False, False, _EXCL, _PR, _R2, _T3),
    ("T3", _REVW, False, True, _T3, _UM, _R3, None),
    ("T3", _REVW, False, False, _T3, _UM, _R3, None),
]


def test_table_is_the_complete_cross_product() -> None:
    """A dropped or duplicated row must fail rather than silently shrink the criterion."""
    assert len(DECISION_TABLE) == 72
    keys = {(row[0], row[1], row[2], row[3]) for row in DECISION_TABLE}
    assert len(keys) == 72
    expected = {
        (initial, status, quarantine, evidence)
        for initial in ("T1", "T2", "T3")
        for status in LicenceStatus
        for quarantine in (True, False)
        for evidence in (True, False)
    }
    assert keys == expected


@pytest.mark.parametrize(
    ("initial", "status", "quarantine", "evidence", "tier", "reason", "rule", "downgraded_from"),
    DECISION_TABLE,
    ids=[
        f"{row[0]}-{row[1].value}-q{int(row[2])}-e{int(row[3])}" for row in DECISION_TABLE
    ],
)
def test_decision_table(
    initial: str,
    status: LicenceStatus,
    quarantine: bool,
    evidence: bool,
    tier: IndexTier,
    reason: str,
    rule: str,
    downgraded_from: IndexTier | None,
) -> None:
    decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_status=status,
            quarantine_open=quarantine,
            is_evidence_bearing=evidence,
        )
    )
    assert decision.tier is tier
    assert decision.reason_code == reason
    assert decision.applied_rule == rule
    assert decision.downgraded_from is downgraded_from


@pytest.mark.parametrize(
    ("initial", "status", "quarantine", "evidence", "tier", "reason", "rule", "downgraded_from"),
    DECISION_TABLE,
)
def test_table_never_upgrades(
    initial: str,
    status: LicenceStatus,
    quarantine: bool,
    evidence: bool,
    tier: IndexTier,
    reason: str,
    rule: str,
    downgraded_from: IndexTier | None,
) -> None:
    """The table itself must not encode an upgrade — a typo above cannot legalise one."""
    from tiering import tier_rank

    assert tier_rank(tier) <= tier_rank(MAPPED[initial])
