"""The tier-assignment policy: pure, total, no I/O (CRPS-04 deliverables 2, 3 and 4).

PRECEDENCE (deliverable 3 — load-bearing). Restrictions always dominate and nothing is ever
upgraded:

1. `quarantine_open` -> `QUARANTINED_QUALITY` (terminal).            PRD §35.3
2. `PROHIBITED` or storage refused -> `EXCLUDED_LICENSING` (terminal). PRD §11.1
3. `METADATA_AND_LINK_ONLY` / `UNCLEAR_RESTRICTED` / `REVIEW_REQUIRED`, or indexing refused ->
   at most `TIER_3_METADATA_AND_ON_DEMAND` (terminal).                PRD §11.1
4. embedding refused -> a CAP at `TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC`. NOT terminal, and NOT an
   exclusion: a licence that forbids embedding must not delete lexical coverage. PRD §2, §11.1, §40.1
5. otherwise the source group's initial tier.                          PRD §40.1
6. non-evidence-bearing structural material: one tier down, floored at Tier 3, never applied to
   evidence-bearing text.                                             PRD §17.2
7. no rule may return a tier above the source group's initial tier. Asserted in this function, not
   only in the tests.

Steps 4-6 are combined as a set of CAPS and the LOWEST wins, which is what makes step 7 structural
rather than aspirational: `_combine` is a minimum over caps and can never invent a higher tier.

PURITY. No file, socket, database, subprocess, clock, RNG or logging; no module-level mutable state
and no cache (a module-level `functools.lru_cache` would be a shared-state hazard for a parallel
CRPS-06 build — the per-node memo in `assign_tiers` is a LOCAL dict). Imports are stdlib only, and
`src/tiering/**` imports neither `chunking` nor `manifest` (deliverable 4) — the binding to the
canonical `packages/contracts` enums is a test-time assertion, so `assign_tier()` cannot fail
because a file is missing.

WHAT THIS MODULE NEVER DOES. It never decides a licence (`INGF-04`) or a quarantine (`INGF-05`) — it
consumes them. It holds no capacity number of any kind: `document_type`, `legal_status`,
`source_group_id` and `node_char_count` are never read by the decision, so a deferred breakdown-plan
§8 Q3 capacity figure cannot enter as a tier downgrade (PRD §2: cost is controlled by tiering, "not
by silently deleting agreed legal scope").
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from types import MappingProxyType

from .errors import (
    InvalidTieringInput,
    MissingTieringInput,
    TieringError,
    UnknownLicenceState,
    UnknownSourceTier,
)
from .inputs import ChunkStructure, ChunkTierAssignment, TieringInput
from .reasons import (
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
    RULE_NON_EVIDENCE_STRUCTURAL,
    RULE_QUARANTINE_OPEN,
    RULE_SOURCE_INITIAL_TIER,
)
from .tiers import SOURCE_TIER_TO_INDEX_TIER, IndexTier, LicenceStatus, tier_rank

__all__ = ["TierDecision", "assign_tier", "assign_tiers"]


_METADATA_ONLY_STATES: frozenset[LicenceStatus] = frozenset(
    {
        LicenceStatus.METADATA_AND_LINK_ONLY,
        LicenceStatus.UNCLEAR_RESTRICTED,
        LicenceStatus.REVIEW_REQUIRED,
    }
)
"""PRD §11.1: "Unclear rights default to metadata, limited quotation and official links."."""

_ONE_STEP_DOWN: Mapping[IndexTier, IndexTier] = MappingProxyType(
    {
        IndexTier.TIER_1_FULL_SEMANTIC: IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
        IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC: IndexTier.TIER_3_METADATA_AND_ON_DEMAND,
        IndexTier.TIER_3_METADATA_AND_ON_DEMAND: IndexTier.TIER_3_METADATA_AND_ON_DEMAND,
    }
)
"""Rule 6: one tier down, floored at Tier 3 (PRD §17.2 — Tier 3 has no default embedding, so a
further step would remove lexical coverage, which rule 6 must never do)."""


@dataclass(frozen=True, slots=True)
class TierDecision:
    """The outcome for one node version. Deliverable 2.

    `downgraded_from` is set exactly when `tier` differs from the rule-5 tier (the source group's
    initial tier), and when set it always IS that tier. A rule may therefore fire without a
    downgrade: `T3` + `UNCLEAR_RESTRICTED` applies rule 3 and stays at Tier 3, so
    `downgraded_from is None`.
    """

    tier: IndexTier
    reason_code: str
    applied_rule: str
    downgraded_from: IndexTier | None


def _require_bool(value: object, field: str, error: type[TieringError]) -> bool:
    """Return *value* if it is exactly a `bool`; otherwise raise. `None` = "not assessed"."""
    if type(value) is not bool:
        raise error(
            f"{field}={value!r} is not a boolean. An unassessed or unknown decision fails closed "
            f"(PRD §11.1, §12.2); it is never treated as permitted."
        )
    return value


def _licence_status(inp: TieringInput) -> LicenceStatus:
    """Narrow `licence_status` to a declared member, or fail closed (PRD §11.1, §12.2)."""
    try:
        return LicenceStatus(inp.licence_status)
    except (ValueError, TypeError, KeyError) as exc:
        raise UnknownLicenceState(
            f"licence_status={inp.licence_status!r} is not one of "
            f"{', '.join(member.value for member in LicenceStatus)}. Tiering fails closed rather "
            f"than defaulting to PERMITTED (PRD §11.1, §12.2)."
        ) from exc


def _base_tier(inp: TieringInput) -> IndexTier:
    """The rule-5 tier: the source group's initial tier (PRD §40.1). Never defaults to `T1`."""
    try:
        return SOURCE_TIER_TO_INDEX_TIER[inp.source_initial_tier]
    except (KeyError, TypeError) as exc:
        raise UnknownSourceTier(
            f"source_initial_tier={inp.source_initial_tier!r} is not one of "
            f"{', '.join(SOURCE_TIER_TO_INDEX_TIER)} (PRD §40.1). Tiering fails closed rather than "
            f"assuming a tier."
        ) from exc


def _decide(tier: IndexTier, reason_code: str, applied_rule: str, base: IndexTier) -> TierDecision:
    """Build a `TierDecision`, computing `downgraded_from` in the ONE place it is computed."""
    return TierDecision(
        tier=tier,
        reason_code=reason_code,
        applied_rule=applied_rule,
        downgraded_from=base if tier is not base else None,
    )


def _floor(left: IndexTier, right: IndexTier) -> IndexTier:
    """The lower-ranked of two tiers. Ties keep *left*; never returns something higher than either."""
    return right if tier_rank(right) < tier_rank(left) else left


def assign_tier(inp: TieringInput) -> TierDecision:
    """Assign exactly one PRD §17.2 tier to one node version. Pure, total, no I/O.

    Raises `UnknownLicenceState`, `UnknownSourceTier` or `InvalidTieringInput` (all `TieringError`)
    on evidence that is unknown, unassessed or structurally invalid — never a permissive default.
    """
    status = _licence_status(inp)
    base = _base_tier(inp)
    permits_storage = _require_bool(
        inp.licence_permits_storage, "licence_permits_storage", UnknownLicenceState
    )
    permits_indexing = _require_bool(
        inp.licence_permits_indexing, "licence_permits_indexing", UnknownLicenceState
    )
    permits_embedding = _require_bool(
        inp.licence_permits_embedding, "licence_permits_embedding", UnknownLicenceState
    )
    quarantine_open = _require_bool(inp.quarantine_open, "quarantine_open", InvalidTieringInput)
    is_evidence_bearing = _require_bool(
        inp.is_evidence_bearing, "is_evidence_bearing", InvalidTieringInput
    )
    if type(inp.node_char_count) is not int or inp.node_char_count < 0:
        raise InvalidTieringInput(
            f"node_char_count={inp.node_char_count!r} must be a non-negative int. (It is carried "
            f"for reporting only and is never read by the decision.)"
        )

    decision = _assign(
        base=base,
        status=status,
        permits_storage=permits_storage,
        permits_indexing=permits_indexing,
        permits_embedding=permits_embedding,
        quarantine_open=quarantine_open,
        is_evidence_bearing=is_evidence_bearing,
    )

    # Rule 7, enforced here and not merely documented: no rule may upgrade (PRD §40.1).
    if tier_rank(decision.tier) > tier_rank(base):
        raise TieringError(
            f"internal invariant violated: rule {decision.applied_rule} returned "
            f"{decision.tier.value}, which is above the source-group initial tier {base.value}. "
            f"PRD §40.1: licensing can only reduce permitted display/indexing, never raise it."
        )
    return decision


def _assign(
    *,
    base: IndexTier,
    status: LicenceStatus,
    permits_storage: bool,
    permits_indexing: bool,
    permits_embedding: bool,
    quarantine_open: bool,
    is_evidence_bearing: bool,
) -> TierDecision:
    """The precedence order over already-validated evidence."""
    # Rule 1 — quarantine dominates everything, including a T1 + PERMITTED source (PRD §35.3).
    if quarantine_open:
        return _decide(
            IndexTier.QUARANTINED_QUALITY, REASON_QUARANTINE_OPEN, RULE_QUARANTINE_OPEN, base
        )

    # Rule 2 — the licence forbids holding the material at all (PRD §11.1).
    if status is LicenceStatus.PROHIBITED:
        return _decide(
            IndexTier.EXCLUDED_LICENSING, REASON_LICENCE_PROHIBITED, RULE_LICENCE_EXCLUDED, base
        )
    if not permits_storage:
        return _decide(
            IndexTier.EXCLUDED_LICENSING, REASON_LICENCE_NO_STORAGE, RULE_LICENCE_EXCLUDED, base
        )

    # Rule 3 — unclear or metadata-only rights default to metadata and links (PRD §11.1).
    metadata_only = IndexTier.TIER_3_METADATA_AND_ON_DEMAND
    if status in _METADATA_ONLY_STATES:
        return _decide(
            _floor(metadata_only, base),
            REASON_LICENCE_UNCLEAR_DEFAULT_METADATA,
            RULE_LICENCE_METADATA_ONLY,
            base,
        )
    if not permits_indexing:
        return _decide(
            _floor(metadata_only, base),
            REASON_LICENCE_NO_INDEXING,
            RULE_LICENCE_METADATA_ONLY,
            base,
        )

    # Rules 4-6 — caps, lowest wins. Rule order (R4 < R5 < R6) breaks a tie deterministically.
    caps: list[tuple[IndexTier, str, str]] = []
    if not permits_embedding:
        caps.append(
            (
                IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
                REASON_LICENCE_NO_EMBEDDING,
                RULE_LICENCE_NO_EMBEDDING_CAP,
            )
        )
    caps.append((base, REASON_SOURCE_INITIAL_TIER, RULE_SOURCE_INITIAL_TIER))
    if not is_evidence_bearing:
        caps.append(
            (
                _ONE_STEP_DOWN[base],
                REASON_NON_EVIDENCE_STRUCTURAL,
                RULE_NON_EVIDENCE_STRUCTURAL,
            )
        )

    final = base
    for tier, _reason, _rule in caps:
        final = _floor(final, tier)

    # A tier equal to the source-group tier is not a downgrade, whichever cap also reached it.
    if final is base:
        return _decide(base, REASON_SOURCE_INITIAL_TIER, RULE_SOURCE_INITIAL_TIER, base)
    for tier, reason, rule in caps:
        if tier is final:
            return _decide(final, reason, rule, base)
    raise TieringError(  # pragma: no cover - unreachable: `final` is one of the caps by construction
        "internal invariant violated: the combined tier is not one of the applied caps."
    )


def assign_tiers(
    chunks: Iterable[ChunkStructure],
    inputs_by_node: Mapping[str, TieringInput],
) -> list[ChunkTierAssignment]:
    """Assign a tier to every chunk, in input order (deliverable 4).

    *chunks* is consumed by structural fields only (`node_version_id`, `chunk_ordinal`,
    `char_count`), so a CRPS-03 `SearchChunkDraft` fits without this module importing `chunking`.

    A chunk whose node has no `TieringInput` raises `MissingTieringInput` naming the node — an
    unassessed node is a build error, never "assume permitted".
    """
    memo: dict[str, TierDecision] = {}
    assignments: list[ChunkTierAssignment] = []
    for chunk in chunks:
        node_version_id = chunk.node_version_id
        decision = memo.get(node_version_id)
        if decision is None:
            try:
                node_input = inputs_by_node[node_version_id]
            except KeyError as exc:
                raise MissingTieringInput(
                    f"no TieringInput for node_version_id={node_version_id!r}: the licence "
                    f"assessment and quarantine state for this node are unknown, so no tier can be "
                    f"assigned. Tiering fails closed (PRD §11.1, §12.2)."
                ) from exc
            decision = assign_tier(node_input)
            memo[node_version_id] = decision
        assignments.append(
            ChunkTierAssignment(
                node_version_id=node_version_id,
                chunk_ordinal=chunk.chunk_ordinal,
                tier=decision.tier,
                reason_code=decision.reason_code,
                source_group_id=inputs_by_node[node_version_id].source_group_id,
                char_count=chunk.char_count,
            )
        )
    return assignments
