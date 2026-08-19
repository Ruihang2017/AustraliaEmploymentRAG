"""The mandatory source-group roster of PRD §40.2–40.6 (CRPS-06 deliverable 4.1).

WHY THE IDS ARE WRITTEN OUT HERE, and why that is not a PRD §35.1 violation.

PRD §35.1 forbids hand-copying *enumerations*, whose canonical vocabulary is the
`packages/contracts` export. The source-group roster is not one of those: it exists ONLY as markdown
tables in `docs/PRD.md` §40.2–40.6, and nothing publishes it machine-readably. Production code must
not read `docs/PRD.md` (it is a document, not a contract, and it is frozen), so the roster is
transcribed here VERBATIM — the same reconciliation `tiering/tiers.py` records for `IndexTier`:

    the constant below is the static declaration, and
    `tests/validation/test_source_group_roster_drift.py` parses PRD §40.2–40.6's table rows
    READ-ONLY and asserts set equality with it.

A roster edit in the PRD therefore fails a test instead of silently under-gating a release. Adding,
removing or renaming a member here without the PRD change is a defect; the correct order is PRD
change first (which is a Founder decision, §40 being frozen scope), then this constant.

WHAT "MANDATORY" MEANS, from PRD §40.1: *"The rows below are mandatory source groups, not claims
that adapters already exist. Every row starts `NOT_STARTED` and must become `ACTIVE` or an explicit
customer-visible limited state before release."* Note that `packages/contracts`' `SourceCoverageStatus`
publishes NO `ACTIVE` member — the five members are `PLANNED_NOT_ACTIVE` plus the four explicit
limited states — so the corpus-side rule the completeness gate enforces is exactly: every group is
PRESENT, and none of them is `PLANNED_NOT_ACTIVE`.
"""

from __future__ import annotations

from typing import Final, Mapping

__all__ = [
    "MANDATORY_SOURCE_GROUPS",
    "PRD_SECTION_OF",
    "ROSTER_PRD_SECTIONS",
]

#: The PRD sections the roster is transcribed from, in order. Used by the drift test.
ROSTER_PRD_SECTIONS: Final[tuple[str, ...]] = ("40.2", "40.3", "40.4", "40.5", "40.6")

_WAVE_1_LEGISLATION: Final[tuple[str, ...]] = (
    "LEG-CTH",
    "LEG-NSW",
    "LEG-VIC",
    "LEG-QLD",
    "LEG-WA",
    "LEG-SA",
    "LEG-TAS",
    "LEG-ACT",
    "LEG-NT",
)

_WAVE_2_INSTRUMENTS_AND_PAYROLL_TAX: Final[tuple[str, ...]] = (
    "FWC-DOCS",
    "FWC-AWARDS",
    "FWC-AGREEMENTS",
    "FWO-GUIDANCE",
    "ATO-EMPLOYMENT",
    "PT-NSW",
    "PT-VIC",
    "PT-QLD",
    "PT-WA",
    "PT-SA",
    "PT-TAS",
    "PT-ACT",
    "PT-NT",
)

_WAVE_3_COURTS_AND_TRIBUNALS: Final[tuple[str, ...]] = (
    "CASE-HCA",
    "CASE-FCA",
    "CASE-FCFCOA",
    "CASE-FWC",
    "CASE-NSW",
    "CASE-VIC",
    "CASE-QLD",
    "CASE-WA",
    "CASE-SA",
    "CASE-TAS",
    "CASE-ACT",
    "CASE-NT",
)

_WAVE_4_ADJACENT_REGIMES: Final[tuple[str, ...]] = (
    "ADJ-CTH",
    "ADJ-NSW",
    "ADJ-VIC",
    "ADJ-QLD",
    "ADJ-WA",
    "ADJ-SA",
    "ADJ-TAS",
    "ADJ-ACT",
    "ADJ-NT",
)

_WAVE_5_FUTURE_LAW: Final[tuple[str, ...]] = (
    "FUTURE-CTH",
    "FUTURE-NSW",
    "FUTURE-VIC",
    "FUTURE-QLD",
    "FUTURE-WA",
    "FUTURE-SA",
    "FUTURE-TAS",
    "FUTURE-ACT",
    "FUTURE-NT",
)

#: Every mandatory source group, in PRD order. 52 groups across five waves.
MANDATORY_SOURCE_GROUPS: Final[tuple[str, ...]] = (
    _WAVE_1_LEGISLATION
    + _WAVE_2_INSTRUMENTS_AND_PAYROLL_TAX
    + _WAVE_3_COURTS_AND_TRIBUNALS
    + _WAVE_4_ADJACENT_REGIMES
    + _WAVE_5_FUTURE_LAW
)

#: Which PRD section each group is transcribed from — carried into the finding's evidence so an
#: operator reading a missing-group finding can open the right table.
PRD_SECTION_OF: Final[Mapping[str, str]] = {
    **{group: "§40.2" for group in _WAVE_1_LEGISLATION},
    **{group: "§40.3" for group in _WAVE_2_INSTRUMENTS_AND_PAYROLL_TAX},
    **{group: "§40.4" for group in _WAVE_3_COURTS_AND_TRIBUNALS},
    **{group: "§40.5" for group in _WAVE_4_ADJACENT_REGIMES},
    **{group: "§40.6" for group in _WAVE_5_FUTURE_LAW},
}
