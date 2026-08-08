"""Import path and input builders for the tier-assignment suite (CRPS-04).

`pipelines/corpus-builder/src` is not importable by package path (the member directory name contains
a hyphen) and the root pytest config puts only the repository root on `sys.path`, so each test
directory in this ticket's file-scope prepends it here. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.

`FakeChunk` deliberately duplicates only the three structural members of a CRPS-03
`SearchChunkDraft`: the suite must prove that `assign_tiers` consumes a chunk structurally, WITHOUT
importing `chunking` (deliverable 4).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
SRC = REPO_ROOT / "pipelines" / "corpus-builder" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

TIERING_SRC = SRC / "tiering"

from tiering import IndexTier, LicenceStatus, TieringInput  # noqa: E402

INITIAL_TIERS: tuple[str, ...] = ("T1", "T2", "T3")
"""PRD §40.1 roster values, in roster order."""

MAPPED: dict[str, IndexTier] = {
    "T1": IndexTier.TIER_1_FULL_SEMANTIC,
    "T2": IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC,
    "T3": IndexTier.TIER_3_METADATA_AND_ON_DEMAND,
}
"""Written out in the TEST as literal data, so the decision table never re-derives the mapping from
the implementation it is checking."""

LICENCE_STATES: tuple[LicenceStatus, ...] = tuple(LicenceStatus)


def make_input(**overrides: object) -> TieringInput:
    """A permissive, valid `TieringInput`; every field is overridable by keyword.

    The defaults are the "nothing restricts this" corner of the space, so any test that produces a
    downgrade has produced it from the field it varied and from nothing else.
    """
    fields: dict[str, object] = {
        "source_group_id": "grp_test_1",
        "source_initial_tier": "T1",
        "licence_status": LicenceStatus.PERMITTED,
        "licence_permits_indexing": True,
        "licence_permits_embedding": True,
        "licence_permits_storage": True,
        "quarantine_open": False,
        "document_type": "legislation",
        "legal_status": "IN_FORCE",
        "is_evidence_bearing": True,
        "node_char_count": 512,
    }
    unknown = set(overrides) - set(fields)
    if unknown:
        raise AssertionError(f"make_input got unknown field(s): {sorted(unknown)}")
    fields.update(overrides)
    return TieringInput(**fields)  # type: ignore[arg-type]


@dataclass(frozen=True, slots=True)
class FakeChunk:
    """The structural view of a CRPS-03 `SearchChunkDraft` — the three members `assign_tiers` reads.

    Declared here rather than imported from `chunking` on purpose: the suite proves that structural
    consumption works, and the boundary test proves that `chunking` is never imported.
    """

    node_version_id: str
    chunk_ordinal: int
    char_count: int
