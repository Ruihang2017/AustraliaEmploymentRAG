"""The declared evidence the tier policy consumes, and the shapes it returns (CRPS-04 deliverables
1 and 4).

`TieringInput` deliberately performs NO validation in `__post_init__`: the record must be able to
transport whatever a database row holds, so validation happens once, at the policy boundary, in
`policy.assign_tier()`. That is what makes "an unknown licence state raises `UnknownLicenceState`"
an assertable property of the decision function rather than of the constructor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

from .tiers import IndexTier, LicenceStatus

__all__ = ["ChunkStructure", "ChunkTierAssignment", "TieringInput"]


@dataclass(frozen=True, slots=True)
class TieringInput:
    """The evidence for one node version. CRPS-04 deliverable 1, members and order verbatim.

    This module CONSUMES a licence assessment (`INGF-04`) and a quarantine state (`INGF-05`); it
    never decides either. The three `licence_permits_*` decisions are separate booleans because PRD
    §11.1 requires them to be stated independently — deriving one from `licence_status` (or vice
    versa) is exactly the inference §11.1 forbids.
    """

    source_group_id: str
    source_initial_tier: Literal["T1", "T2", "T3"]
    licence_status: LicenceStatus
    licence_permits_indexing: bool
    licence_permits_embedding: bool
    licence_permits_storage: bool
    quarantine_open: bool
    document_type: str
    legal_status: str
    is_evidence_bearing: bool
    node_char_count: int

    # The declared type of `licence_status` is `LicenceStatus`. At runtime the field may also hold
    # the raw text of a database column (a `LicenceStatus` IS a `str`, being a `StrEnum`), or
    # anything at all if the caller is wrong; `assign_tier()` narrows it and raises
    # `UnknownLicenceState` on anything that is not a declared member. Nothing here defaults.


@runtime_checkable
class ChunkStructure(Protocol):
    """The structural view of a CRPS-03 `SearchChunkDraft` — deliverable 4.

    Structural typing on purpose: `src/tiering/**` MUST NOT import `chunking` (nor `manifest`), so
    the concurrent-ticket boundary cannot erode. Only these three members are ever read; chunk text
    and its hash are deliberately out of reach, because a policy that needed the text would couple
    this module to CRPS-03's output semantics.
    """

    @property
    def node_version_id(self) -> str: ...

    @property
    def chunk_ordinal(self) -> int: ...

    @property
    def char_count(self) -> int: ...


@dataclass(frozen=True, slots=True)
class ChunkTierAssignment:
    """One chunk's assigned tier. Deliverable 4 names the first four members.

    `source_group_id` and `char_count` are carried alongside them because deliverable 6's
    single-argument `tier_distribution(assignments)` cannot otherwise group per source group or
    total characters. `char_count` is transported for the report only — no threshold reads it, and
    the policy never sees it (see `test_tier_no_budget_constants.py`).
    """

    node_version_id: str
    chunk_ordinal: int
    tier: IndexTier
    reason_code: str
    source_group_id: str
    char_count: int
