"""The eligibility predicates — CRPS-04 acceptance item 7 / deliverable 5 (PRD §17.2).

Parametrised over `list(IndexTier)` so a sixth tier added to the enum fails this suite rather than
silently defaulting to "eligible".
"""

from __future__ import annotations

import pytest
from tiering import (
    TIER_RANK,
    IndexTier,
    is_default_dense,
    is_eligible_for_dense,
    is_eligible_for_lexical,
    tier_rank,
)

_LEXICAL_ELIGIBLE = {
    IndexTier.TIER_1_FULL_SEMANTIC,
    IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
    IndexTier.TIER_3_METADATA_AND_ON_DEMAND,
}
_DENSE_ELIGIBLE = {
    IndexTier.TIER_1_FULL_SEMANTIC,
    IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
}
_EXCLUDED = {IndexTier.EXCLUDED_LICENSING, IndexTier.QUARANTINED_QUALITY}


@pytest.mark.parametrize("tier", list(IndexTier), ids=lambda tier: tier.value)
def test_is_eligible_for_lexical(tier: IndexTier) -> None:
    """"The complete eligible corpus" is Tiers 1-3; the two excluded states are outside it."""
    assert is_eligible_for_lexical(tier) is (tier in _LEXICAL_ELIGIBLE)


@pytest.mark.parametrize("tier", list(IndexTier), ids=lambda tier: tier.value)
def test_is_eligible_for_dense(tier: IndexTier) -> None:
    """Tier 1 (full) and Tier 2 (selective/on-demand) only; Tier 3 has no default embedding."""
    assert is_eligible_for_dense(tier) is (tier in _DENSE_ELIGIBLE)


@pytest.mark.parametrize("tier", list(IndexTier), ids=lambda tier: tier.value)
def test_is_default_dense(tier: IndexTier) -> None:
    """Only Tier 1 is embedded by default — Tier 2 eligibility is permission, not an instruction."""
    assert is_default_dense(tier) is (tier is IndexTier.TIER_1_FULL_SEMANTIC)


@pytest.mark.parametrize("tier", sorted(_EXCLUDED, key=lambda tier: tier.value))
def test_excluded_states_are_ineligible_for_both(tier: IndexTier) -> None:
    """The Reviewer-focus item: excluded material must not leak into EITHER index."""
    assert is_eligible_for_lexical(tier) is False
    assert is_eligible_for_dense(tier) is False
    assert is_default_dense(tier) is False


def test_dense_eligibility_implies_lexical_eligibility() -> None:
    """Dense indexing is a superset behaviour: nothing may be dense-eligible but lexically excluded."""
    for tier in IndexTier:
        if is_eligible_for_dense(tier):
            assert is_eligible_for_lexical(tier)
        if is_default_dense(tier):
            assert is_eligible_for_dense(tier)


def test_every_tier_has_a_declared_rank() -> None:
    """A tier added without a rank must raise from `tier_rank`, not be silently treated as eligible."""
    assert set(TIER_RANK) == set(IndexTier)
    for tier in IndexTier:
        assert isinstance(tier_rank(tier), int)


def test_the_two_excluded_states_share_the_floor_rank() -> None:
    """Neither excluded state is "better" than the other (CRPS-04 acceptance item 2's ordering)."""
    assert tier_rank(IndexTier.EXCLUDED_LICENSING) == tier_rank(IndexTier.QUARANTINED_QUALITY)
    assert tier_rank(IndexTier.EXCLUDED_LICENSING) < tier_rank(
        IndexTier.TIER_3_METADATA_AND_ON_DEMAND
    )
    assert tier_rank(IndexTier.TIER_3_METADATA_AND_ON_DEMAND) < tier_rank(
        IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC
    )
    assert tier_rank(IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC) < tier_rank(
        IndexTier.TIER_1_FULL_SEMANTIC
    )


def test_tier_rank_mapping_is_read_only() -> None:
    with pytest.raises(TypeError):
        TIER_RANK[IndexTier.EXCLUDED_LICENSING] = 99  # type: ignore[index]
