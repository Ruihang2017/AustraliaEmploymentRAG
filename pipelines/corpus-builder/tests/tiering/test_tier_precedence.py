"""The per-decision licence booleans and the named precedence criteria (CRPS-04 items 3-6).

`test_decision_table.py` holds the three `licence_permits_*` decisions constant so that the STATUS
axis is clean. This module does the complement: an explicit 24-row table over
(3 initial tiers x the 8 combinations of storage/indexing/embedding), with `PERMITTED`, no
quarantine and evidence-bearing text — plus the collision cases where two triggers fire at once and
the reason must be deterministic rather than incidental.
"""

from __future__ import annotations

import pytest
from conftest import INITIAL_TIERS, MAPPED, make_input
from tiering import (
    REASON_LICENCE_NO_EMBEDDING,
    REASON_LICENCE_NO_INDEXING,
    REASON_LICENCE_NO_STORAGE,
    REASON_LICENCE_PROHIBITED,
    REASON_LICENCE_UNCLEAR_DEFAULT_METADATA,
    REASON_NON_EVIDENCE_STRUCTURAL,
    REASON_QUARANTINE_OPEN,
    REASON_SOURCE_INITIAL_TIER,
    RULE_LICENCE_EXCLUDED,
    RULE_LICENCE_METADATA_ONLY,
    RULE_LICENCE_NO_EMBEDDING_CAP,
    RULE_QUARANTINE_OPEN,
    RULE_SOURCE_INITIAL_TIER,
    IndexTier,
    LicenceStatus,
    assign_tier,
    tier_rank,
)

_T1 = IndexTier.TIER_1_FULL_SEMANTIC
_T2 = IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC
_T3 = IndexTier.TIER_3_METADATA_AND_ON_DEMAND
_EXCL = IndexTier.EXCLUDED_LICENSING

_NS = REASON_LICENCE_NO_STORAGE
_NI = REASON_LICENCE_NO_INDEXING
_NE = REASON_LICENCE_NO_EMBEDDING
_SI = REASON_SOURCE_INITIAL_TIER

_R2 = RULE_LICENCE_EXCLUDED
_R3 = RULE_LICENCE_METADATA_ONLY
_R4 = RULE_LICENCE_NO_EMBEDDING_CAP
_R5 = RULE_SOURCE_INITIAL_TIER

# (initial, storage, indexing, embedding, tier, reason, rule, downgraded_from)
PERMIT_TABLE: list[tuple[str, bool, bool, bool, IndexTier, str, str, IndexTier | None]] = [
    # T1 ---------------------------------------------------------------------------------------
    ("T1", True, True, True, _T1, _SI, _R5, None),
    # Rule 4 is a CAP, not an exclusion: refusing dense indexing must not delete lexical coverage.
    ("T1", True, True, False, _T2, _NE, _R4, _T1),
    ("T1", True, False, True, _T3, _NI, _R3, _T1),
    ("T1", True, False, False, _T3, _NI, _R3, _T1),
    ("T1", False, True, True, _EXCL, _NS, _R2, _T1),
    ("T1", False, True, False, _EXCL, _NS, _R2, _T1),
    ("T1", False, False, True, _EXCL, _NS, _R2, _T1),
    ("T1", False, False, False, _EXCL, _NS, _R2, _T1),
    # T2 ---------------------------------------------------------------------------------------
    ("T2", True, True, True, _T2, _SI, _R5, None),
    # The Tier-2 cap does not bind on a T2 source: `min` never invents a downgrade.
    ("T2", True, True, False, _T2, _SI, _R5, None),
    ("T2", True, False, True, _T3, _NI, _R3, _T2),
    ("T2", True, False, False, _T3, _NI, _R3, _T2),
    ("T2", False, True, True, _EXCL, _NS, _R2, _T2),
    ("T2", False, True, False, _EXCL, _NS, _R2, _T2),
    ("T2", False, False, True, _EXCL, _NS, _R2, _T2),
    ("T2", False, False, False, _EXCL, _NS, _R2, _T2),
    # T3 ---------------------------------------------------------------------------------------
    ("T3", True, True, True, _T3, _SI, _R5, None),
    ("T3", True, True, False, _T3, _SI, _R5, None),
    # Rule 3's floor is already the source tier, so the rule fires without a downgrade.
    ("T3", True, False, True, _T3, _NI, _R3, None),
    ("T3", True, False, False, _T3, _NI, _R3, None),
    ("T3", False, True, True, _EXCL, _NS, _R2, _T3),
    ("T3", False, True, False, _EXCL, _NS, _R2, _T3),
    ("T3", False, False, True, _EXCL, _NS, _R2, _T3),
    ("T3", False, False, False, _EXCL, _NS, _R2, _T3),
]


def test_permit_table_is_the_complete_cross_product() -> None:
    assert len(PERMIT_TABLE) == 24
    assert len({row[:4] for row in PERMIT_TABLE}) == 24


@pytest.mark.parametrize(
    ("initial", "storage", "indexing", "embedding", "tier", "reason", "rule", "downgraded_from"),
    PERMIT_TABLE,
    ids=[f"{r[0]}-s{int(r[1])}-i{int(r[2])}-e{int(r[3])}" for r in PERMIT_TABLE],
)
def test_permit_decisions(
    initial: str,
    storage: bool,
    indexing: bool,
    embedding: bool,
    tier: IndexTier,
    reason: str,
    rule: str,
    downgraded_from: IndexTier | None,
) -> None:
    decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_permits_storage=storage,
            licence_permits_indexing=indexing,
            licence_permits_embedding=embedding,
        )
    )
    assert decision.tier is tier
    assert decision.reason_code == reason
    assert decision.applied_rule == rule
    assert decision.downgraded_from is downgraded_from


# --------------------------------------------------------------------------- acceptance item 3
@pytest.mark.parametrize("initial", INITIAL_TIERS)
@pytest.mark.parametrize("status", list(LicenceStatus))
@pytest.mark.parametrize("evidence", [True, False])
@pytest.mark.parametrize("storage", [True, False])
def test_quarantine_wins_over_everything(
    initial: str, status: LicenceStatus, evidence: bool, storage: bool
) -> None:
    """PRD §35.3 — including the most permissive input there is: T1 + PERMITTED + all permits."""
    decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_status=status,
            is_evidence_bearing=evidence,
            licence_permits_storage=storage,
            quarantine_open=True,
        )
    )
    assert decision.tier is IndexTier.QUARANTINED_QUALITY
    assert decision.reason_code == REASON_QUARANTINE_OPEN
    assert decision.applied_rule == RULE_QUARANTINE_OPEN


# --------------------------------------------------------------------------- acceptance item 4
@pytest.mark.parametrize("initial", INITIAL_TIERS)
@pytest.mark.parametrize("evidence", [True, False])
@pytest.mark.parametrize("embedding", [True, False])
def test_unclear_restricted_never_yields_tier_1_or_2(
    initial: str, evidence: bool, embedding: bool
) -> None:
    """PRD §11.1 — unclear rights default to metadata, limited quotation and official links."""
    decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_status=LicenceStatus.UNCLEAR_RESTRICTED,
            is_evidence_bearing=evidence,
            licence_permits_embedding=embedding,
        )
    )
    assert decision.tier not in (_T1, _T2)
    assert decision.tier is _T3
    assert decision.reason_code == REASON_LICENCE_UNCLEAR_DEFAULT_METADATA


# --------------------------------------------------------------------------- acceptance item 5
def test_no_embedding_on_a_t1_permitted_source_is_tier_2_not_excluded() -> None:
    """PRD §2, §17.2, §40.1 — a licence that forbids embedding must not delete lexical coverage."""
    decision = assign_tier(
        make_input(
            source_initial_tier="T1",
            licence_status=LicenceStatus.PERMITTED,
            licence_permits_embedding=False,
        )
    )
    assert decision.tier is _T2
    assert decision.tier is not _EXCL
    assert decision.reason_code == REASON_LICENCE_NO_EMBEDDING
    assert decision.applied_rule == _R4
    assert decision.downgraded_from is _T1
    from tiering import is_eligible_for_lexical

    assert is_eligible_for_lexical(decision.tier) is True


# --------------------------------------------------------------------------- acceptance item 6
@pytest.mark.parametrize("initial", INITIAL_TIERS)
@pytest.mark.parametrize("status", [LicenceStatus.PERMITTED, LicenceStatus.PERMITTED_WITH_ATTRIBUTION])
@pytest.mark.parametrize("embedding", [True, False])
def test_evidence_bearing_material_is_never_reduced_by_rule_6(
    initial: str, status: LicenceStatus, embedding: bool
) -> None:
    """PRD §17.2 "Embedding eviction MUST NOT remove legal evidence" — rule 6 never fires here."""
    evidence_decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_status=status,
            licence_permits_embedding=embedding,
            is_evidence_bearing=True,
        )
    )
    assert evidence_decision.reason_code != REASON_NON_EVIDENCE_STRUCTURAL
    # And it is never worse than the same input with the structural flag set.
    structural_decision = assign_tier(
        make_input(
            source_initial_tier=initial,
            licence_status=status,
            licence_permits_embedding=embedding,
            is_evidence_bearing=False,
        )
    )
    assert tier_rank(evidence_decision.tier) >= tier_rank(structural_decision.tier)


@pytest.mark.parametrize("initial", INITIAL_TIERS)
def test_rule_6_floors_at_tier_3(initial: str) -> None:
    """Rule 6 drops one tier and never below Tier 3 — structural material keeps lexical coverage."""
    decision = assign_tier(make_input(source_initial_tier=initial, is_evidence_bearing=False))
    assert tier_rank(decision.tier) >= tier_rank(_T3)
    expected = {"T1": _T2, "T2": _T3, "T3": _T3}[initial]
    assert decision.tier is expected


# ------------------------------------------------------- deterministic reasons when triggers collide
def test_prohibited_beats_a_refused_storage_decision() -> None:
    decision = assign_tier(
        make_input(licence_status=LicenceStatus.PROHIBITED, licence_permits_storage=False)
    )
    assert decision.tier is _EXCL
    assert decision.reason_code == REASON_LICENCE_PROHIBITED


def test_unclear_status_beats_a_refused_indexing_decision() -> None:
    decision = assign_tier(
        make_input(
            licence_status=LicenceStatus.UNCLEAR_RESTRICTED, licence_permits_indexing=False
        )
    )
    assert decision.tier is _T3
    assert decision.reason_code == REASON_LICENCE_UNCLEAR_DEFAULT_METADATA


def test_embedding_cap_beats_the_structural_cap_at_the_same_tier() -> None:
    """T1 + embedding refused + structural: both caps bind at Tier 2; the lower rule wins."""
    decision = assign_tier(
        make_input(
            source_initial_tier="T1",
            licence_permits_embedding=False,
            is_evidence_bearing=False,
        )
    )
    assert decision.tier is _T2
    assert decision.reason_code == REASON_LICENCE_NO_EMBEDDING
    assert decision.applied_rule == _R4
    assert decision.downgraded_from is _T1


def test_storage_refusal_excludes_even_a_t1_permitted_source() -> None:
    decision = assign_tier(make_input(source_initial_tier="T1", licence_permits_storage=False))
    assert decision.tier is _EXCL
    assert decision.reason_code == _NS
    assert decision.downgraded_from is MAPPED["T1"]
