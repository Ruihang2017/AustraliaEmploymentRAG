"""`MANDATORY_SOURCE_GROUPS` against PRD §40.2–40.6's own tables.

The roster exists ONLY as markdown in `docs/PRD.md`; nothing publishes it machine-readably, and
production code must never read the PRD. This test is the binding: it parses the five tables
READ-ONLY and asserts set equality with the transcribed constant, so a roster edit in the PRD fails
here instead of silently under-gating a release. It is the same reconciliation
`tests/tiering/test_tier_enum_drift.py` uses for `IndexTier`.
"""

from __future__ import annotations

import re

from candidate_paths import REPO_ROOT

from validation.source_groups import (
    MANDATORY_SOURCE_GROUPS,
    PRD_SECTION_OF,
    ROSTER_PRD_SECTIONS,
)

_SECTION = re.compile(r"^### (\d+\.\d+) ")
#: The first cell of a roster row is the group id, in backticks.
_ROW = re.compile(r"^\|\s*`([A-Z][A-Z0-9-]+)`\s*\|")


def _roster_from_prd() -> dict[str, str]:
    text = (REPO_ROOT / "docs" / "PRD.md").read_text(encoding="utf-8")
    found: dict[str, str] = {}
    current: str | None = None
    for line in text.splitlines():
        heading = _SECTION.match(line)
        if heading is not None:
            current = heading.group(1)
            continue
        if current not in ROSTER_PRD_SECTIONS:
            continue
        row = _ROW.match(line)
        if row is not None:
            found[row.group(1)] = f"§{current}"
    return found


def test_the_prd_tables_were_actually_found() -> None:
    """A parser that silently found nothing would make every assertion below vacuous."""
    roster = _roster_from_prd()
    assert len(roster) >= 50, roster


def test_the_transcribed_roster_equals_the_prd_s() -> None:
    roster = _roster_from_prd()
    assert set(MANDATORY_SOURCE_GROUPS) == set(roster), {
        "only_in_code": sorted(set(MANDATORY_SOURCE_GROUPS) - set(roster)),
        "only_in_prd": sorted(set(roster) - set(MANDATORY_SOURCE_GROUPS)),
    }


def test_each_group_is_attributed_to_the_prd_section_it_came_from() -> None:
    roster = _roster_from_prd()
    assert {group: PRD_SECTION_OF[group] for group in MANDATORY_SOURCE_GROUPS} == roster


def test_no_group_is_listed_twice() -> None:
    assert len(MANDATORY_SOURCE_GROUPS) == len(set(MANDATORY_SOURCE_GROUPS))
