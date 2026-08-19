"""`ID_RULES` — ids match `EVAL-<CAT>-<NNN>`, the code matches the directory, ids are globally
unique and never reused (PRD §30.1; sub-PRD D5).

The letter segment is the point: PRD §30.1 requirement ids are `EVAL-001`, `EVAL-002`, … so a case
id without a three-letter code is indistinguishable from a requirement id. `INGF-07`'s
`evaluation_subset_ref: [EVAL-FED-001]` must stay valid, and `EVAL-001` must be rejected.

NEVER REUSED is checked against every prior dataset-version registry, not merely against the current
tree: an id retired in `v1` and reassigned to different content in `v2` would silently invalidate
every past report that cites it, which is what PRD §43.2's "past reports stay reproducible" forbids.
"""

from __future__ import annotations

import re

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories, records

_ID = "ID_RULES"
_DEFAULT_PATTERN = r"^EVAL-(FED|AWD|AGR|PAY|STE|WHS|ADJ|CAS|TMP|SAF)-[0-9]{3}$"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    rules = dataset.id_rules if isinstance(dataset.id_rules, dict) else {}
    pattern = re.compile(rules.get("pattern", _DEFAULT_PATTERN))
    codes = {row.slug: row.code for row in dataset.allocation}

    seen: dict[str, str] = {}
    for entry in categories(dataset, context.category):
        expected_code = codes.get(entry.slug)
        for case_id, _split, path, _raw in records(entry):
            if not isinstance(case_id, str) or not pattern.match(case_id):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case_id or None,
                        "id does not match the EVAL-<CAT>-<NNN> rule in evals/splits/id-rules.yaml; "
                        "an id without a letter segment is a PRD §30.1 requirement id",
                        path,
                    )
                )
                continue
            code = case_id.split("-")[1]
            if expected_code is not None and code != expected_code:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case_id,
                        f"id code {code} does not match the category's code {expected_code}",
                        path,
                    )
                )
            if case_id in seen:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case_id,
                        f"id is not globally unique; it also appears in category {seen[case_id]}",
                        path,
                    )
                )
            else:
                seen[case_id] = entry.slug

    findings.extend(_never_reused(dataset, seen))
    return findings


def _never_reused(dataset: Dataset, present: dict[str, str]) -> list[Finding]:
    """An id registered in a prior version must still name the same category."""
    findings: list[Finding] = []
    for version in dataset.versions:
        for case_id, row in version.rows().items():
            registered = row.get("primary_category")
            here = present.get(case_id)
            if here is not None and registered is not None and here != registered:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        here,
                        case_id,
                        f"id was registered in {version.version} under category {registered} and is "
                        "now used elsewhere; case ids are never reused",
                        str(version.path),
                    )
                )
    return findings
