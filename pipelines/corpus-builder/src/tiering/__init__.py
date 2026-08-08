"""`tiering` — the index-tier assignment policy (CRPS-04).

IMPORT-PATH CONVENTION (set by CRPS-01, binding here)
-----------------------------------------------------
Modules under `pipelines/corpus-builder/src/` are TOP-LEVEL Python modules rooted at that
directory: this package is imported as `tiering`, alongside `contracts`, `chunking` and `manifest`.
There is deliberately no `__init__.py` in `src/` itself. Tests put
`pipelines/corpus-builder/src` on `sys.path` from a per-test-directory `conftest.py`.

GUARANTEES
----------
* **Pure.** `assign_tier()` is a total function of its argument: no file, socket, database,
  subprocess, clock, RNG or logging; no module-level mutable state and no cache. It is therefore
  safe to call from a parallel build.
* **Fail closed.** Unknown, unassessed or invalid evidence raises a typed `TieringError`; nothing
  ever defaults to `PERMITTED` or to `T1`.
* **Never upgrades.** No rule can return a tier above the source group's initial tier (PRD §40.1);
  the invariant is enforced inside `assign_tier()`, not only asserted in the tests.
* **Boundary.** This package imports neither `chunking` (CRPS-03) nor `manifest` (CRPS-02); a chunk
  is consumed through the structural `ChunkStructure` protocol. Asserted by
  `tests/tiering/test_module_boundary.py`.
* **Consumes, never decides.** Licence assessments come from `INGF-04` and quarantine state from
  `INGF-05`. This module authors neither, and it holds no memory, cost or hot-vector figure.

See `README.md` for the decision table and the precedence order.
"""

from __future__ import annotations

from .errors import (
    InvalidTieringInput,
    MissingTieringInput,
    TieringError,
    UnknownLicenceState,
    UnknownSourceTier,
)
from .inputs import ChunkStructure, ChunkTierAssignment, TieringInput
from .policy import TierDecision, assign_tier, assign_tiers
from .reasons import (
    REASON_BASIS,
    REASON_CODES,
    REASON_LICENCE_NO_EMBEDDING,
    REASON_LICENCE_NO_INDEXING,
    REASON_LICENCE_NO_STORAGE,
    REASON_LICENCE_PROHIBITED,
    REASON_LICENCE_UNCLEAR_DEFAULT_METADATA,
    REASON_NON_EVIDENCE_STRUCTURAL,
    REASON_QUARANTINE_OPEN,
    REASON_SOURCE_INITIAL_TIER,
    RULE_IDS,
    RULE_LICENCE_EXCLUDED,
    RULE_LICENCE_METADATA_ONLY,
    RULE_LICENCE_NO_EMBEDDING_CAP,
    RULE_NON_EVIDENCE_STRUCTURAL,
    RULE_QUARANTINE_OPEN,
    RULE_SOURCE_INITIAL_TIER,
)
from .report import TierCount, TierReport, tier_distribution
from .tiers import (
    SOURCE_TIER_TO_INDEX_TIER,
    TIER_RANK,
    IndexTier,
    LicenceStatus,
    is_default_dense,
    is_eligible_for_dense,
    is_eligible_for_lexical,
    tier_rank,
)

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
    "SOURCE_TIER_TO_INDEX_TIER",
    "TIER_RANK",
    "ChunkStructure",
    "ChunkTierAssignment",
    "IndexTier",
    "InvalidTieringInput",
    "LicenceStatus",
    "MissingTieringInput",
    "TierCount",
    "TierDecision",
    "TierReport",
    "TieringError",
    "TieringInput",
    "UnknownLicenceState",
    "UnknownSourceTier",
    "assign_tier",
    "assign_tiers",
    "is_default_dense",
    "is_eligible_for_dense",
    "is_eligible_for_lexical",
    "tier_distribution",
    "tier_rank",
]
