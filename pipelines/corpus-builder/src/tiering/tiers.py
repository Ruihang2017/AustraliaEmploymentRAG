"""The tier and licence vocabularies, the tier ordering and the eligibility predicates (CRPS-04).

WHY THE ENUM MEMBERS ARE WRITTEN OUT HERE (and why this is NOT a PRD §35.1 / sub-PRD D4 violation)
--------------------------------------------------------------------------------------------------
PRD §35.1 forbids hand-copying enum values: the canonical vocabulary lives in the
`packages/contracts` export and everything else is generated from it. A dynamically generated enum,
however, cannot be type-checked, matched exhaustively, or used in a literal decision table — and the
literal decision table IS this ticket's specification (CRPS-04 acceptance item 1).

The reconciliation: the declarations below are static TYPES, and
`tests/tiering/test_tier_enum_drift.py` asserts tuple equality — member for member, IN ORDER —
against `contracts.enums.enum_values("IndexTier")` and
`contracts.enums.enum_values("LicenceAssessmentState")`. Drift on either side is a hard test
failure, exactly as `tests/schema/test_enum_drift.py` achieves for the DDL. The binding is a
test-time assertion rather than an import so that `assign_tier()` stays a pure function that cannot
fail because a file is missing (see `policy`).

NAMING: the canonical family is `LicenceAssessmentState`; the CRPS-04 ticket names the Python type
`LicenceStatus` (deliverable 1). The ticket is the source of truth for the type name, and the drift
test binds the two.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum
from types import MappingProxyType

__all__ = [
    "SOURCE_TIER_TO_INDEX_TIER",
    "TIER_RANK",
    "IndexTier",
    "LicenceStatus",
    "is_default_dense",
    "is_eligible_for_dense",
    "is_eligible_for_lexical",
    "tier_rank",
]


class IndexTier(StrEnum):
    """The five index tiers. PRD §17.2 — order mirrors the `packages/contracts` export."""

    TIER_1_FULL_SEMANTIC = "TIER_1_FULL_SEMANTIC"
    TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC = "TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC"
    TIER_3_METADATA_AND_ON_DEMAND = "TIER_3_METADATA_AND_ON_DEMAND"
    EXCLUDED_LICENSING = "EXCLUDED_LICENSING"
    QUARANTINED_QUALITY = "QUARANTINED_QUALITY"


class LicenceStatus(StrEnum):
    """The six licence-assessment states. PRD §11.1 — family `LicenceAssessmentState`."""

    PERMITTED = "PERMITTED"
    PERMITTED_WITH_ATTRIBUTION = "PERMITTED_WITH_ATTRIBUTION"
    METADATA_AND_LINK_ONLY = "METADATA_AND_LINK_ONLY"
    UNCLEAR_RESTRICTED = "UNCLEAR_RESTRICTED"
    PROHIBITED = "PROHIBITED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


TIER_RANK: Mapping[IndexTier, int] = MappingProxyType(
    {
        IndexTier.TIER_1_FULL_SEMANTIC: 3,
        IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC: 2,
        IndexTier.TIER_3_METADATA_AND_ON_DEMAND: 1,
        IndexTier.EXCLUDED_LICENSING: 0,
        IndexTier.QUARANTINED_QUALITY: 0,
    }
)
"""The ordering of CRPS-04 acceptance item 2 / rule 3.7:
`TIER_1 > TIER_2 > TIER_3 > {EXCLUDED_LICENSING, QUARANTINED_QUALITY}`. The two excluded states
share the floor rank deliberately — neither is "better" than the other, and neither is eligible."""


SOURCE_TIER_TO_INDEX_TIER: Mapping[str, IndexTier] = MappingProxyType(
    {
        "T1": IndexTier.TIER_1_FULL_SEMANTIC,
        "T2": IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
        "T3": IndexTier.TIER_3_METADATA_AND_ON_DEMAND,
    }
)
"""PRD §40.1 / the §40.2-40.6 roster rows' "Initial tier" column. Rule 3.5."""


def tier_rank(tier: IndexTier) -> int:
    """The rank of *tier* under the CRPS-04 ordering. Unknown members raise, never default."""
    return TIER_RANK[tier]


def is_eligible_for_lexical(tier: IndexTier) -> bool:
    """True for Tiers 1-3; False for `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY`.

    PRD §17.2 / CRPS-04 deliverable 5: the complete *eligible* corpus receives
    metadata/lexical/field/citation discovery, and the two excluded states are not part of it.
    Implemented against `tier_rank` so a tier added to the enum without a declared rank raises
    rather than being silently treated as eligible.
    """
    return tier_rank(tier) > 0


def is_eligible_for_dense(tier: IndexTier) -> bool:
    """True for Tier 1 and the selective Tier 2 path; False for Tier 3 and both excluded states.

    PRD §17.2: "Tier 1 receives full dense indexing; Tier 2 selective/on-demand dense indexing;
    Tier 3 no default embedding." Eligibility is permission, not an instruction — see
    `is_default_dense`.
    """
    return tier in (
        IndexTier.TIER_1_FULL_SEMANTIC,
        IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
    )


def is_default_dense(tier: IndexTier) -> bool:
    """True only for Tier 1 — the tier that receives dense indexing by default.

    One boolean cannot express "eligible, but selectively": PRD §17.2 makes Tier 2 *selective /
    on-demand*, so a consumer that reads `is_eligible_for_dense` as "embed everything in Tier 2"
    would embed the whole long tail. This predicate names the distinction PRD §17.2 already states;
    CRPS-05 selects within Tier 2 and this module never does.
    """
    return tier is IndexTier.TIER_1_FULL_SEMANTIC
