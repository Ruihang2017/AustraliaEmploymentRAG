"""The measured distribution of assigned tiers (CRPS-04 deliverable 6).

This report is EVIDENCE, not a control: it feeds the release manifest's `coverage`/`counts` members
(CRPS-02 deliverable 1) through CRPS-06, and it is the measured input for the deferred breakdown-plan
§8 Q3 (`RLSE-11`'s hot-dense-coverage decision) and §8 Q5 (`GOLD-16`'s corpus statistics). It fixes
no capacity figure of any kind, and nothing here can influence a tier — the assignments are already
made when `tier_distribution` sees them.

Every one of the five tiers appears in every mapping, zero-filled, so a downstream reader never has
to distinguish "absent" from "zero"; and `to_dict()` is deterministic (declared tier order, sorted
groups and reasons, plain JSON types), because this output flows into a signed manifest.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from types import MappingProxyType

from .inputs import ChunkTierAssignment
from .tiers import TIER_RANK, IndexTier

__all__ = ["TierCount", "TierReport", "tier_distribution"]

_TIER_ORDER: tuple[IndexTier, ...] = tuple(TIER_RANK)
"""The five tiers in their declared order — the order `to_dict()` emits."""


@dataclass(frozen=True, slots=True)
class TierCount:
    """The chunks and characters counted against one tier."""

    chunks: int
    chars: int


_ZERO = TierCount(chunks=0, chars=0)


@dataclass(frozen=True, slots=True)
class TierReport:
    """The distribution of one assignment set. All mappings are read-only views."""

    total_chunks: int
    total_chars: int
    by_tier: Mapping[IndexTier, TierCount]
    by_source_group: Mapping[str, Mapping[IndexTier, TierCount]]
    by_reason: Mapping[str, int]

    def to_dict(self) -> dict[str, object]:
        """A deterministic, JSON-ready plain-`dict` rendering (stable across calls and processes)."""
        return {
            "total_chunks": self.total_chunks,
            "total_chars": self.total_chars,
            "by_tier": _tier_map_to_dict(self.by_tier),
            "by_source_group": {
                group: _tier_map_to_dict(self.by_source_group[group])
                for group in sorted(self.by_source_group)
            },
            "by_reason": {reason: self.by_reason[reason] for reason in sorted(self.by_reason)},
        }


def _tier_map_to_dict(counts: Mapping[IndexTier, TierCount]) -> dict[str, dict[str, int]]:
    """Render one tier map in declared tier order with plain `str` keys."""
    return {
        str(tier.value): {"chunks": counts[tier].chunks, "chars": counts[tier].chars}
        for tier in _TIER_ORDER
    }


def _freeze(counts: Mapping[IndexTier, TierCount]) -> Mapping[IndexTier, TierCount]:
    """A read-only view holding all five tiers, zero-filled."""
    return MappingProxyType({tier: counts.get(tier, _ZERO) for tier in _TIER_ORDER})


def tier_distribution(assignments: Iterable[ChunkTierAssignment]) -> TierReport:
    """Count chunks and characters per tier, per source group, and per reason code.

    An empty input yields an all-zero report with all five tiers present — never an empty mapping
    and never a division.
    """
    by_tier: dict[IndexTier, TierCount] = {}
    by_group: dict[str, dict[IndexTier, TierCount]] = {}
    by_reason: dict[str, int] = {}
    total_chunks = 0
    total_chars = 0

    for assignment in assignments:
        tier = assignment.tier
        chars = assignment.char_count
        total_chunks += 1
        total_chars += chars

        current = by_tier.get(tier, _ZERO)
        by_tier[tier] = TierCount(chunks=current.chunks + 1, chars=current.chars + chars)

        group = by_group.setdefault(assignment.source_group_id, {})
        group_current = group.get(tier, _ZERO)
        group[tier] = TierCount(chunks=group_current.chunks + 1, chars=group_current.chars + chars)

        by_reason[assignment.reason_code] = by_reason.get(assignment.reason_code, 0) + 1

    return TierReport(
        total_chunks=total_chunks,
        total_chars=total_chars,
        by_tier=_freeze(by_tier),
        by_source_group=MappingProxyType(
            {group: _freeze(counts) for group, counts in sorted(by_group.items())}
        ),
        by_reason=MappingProxyType(dict(sorted(by_reason.items()))),
    )
