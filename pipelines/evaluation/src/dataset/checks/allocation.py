"""`ALLOCATION_EXACT` — per-category and total counts equal `allocation.yaml` EXACTLY.

Not "at least". PRD §43.1: "Cases may carry multiple tags, but each has one primary allocation so
totals cannot drift", and requirement `EVAL-001` (PRD §30.2) IS these counts. Never relax this check
to make an incomplete dataset pass — a relaxed `ALLOCATION_EXACT` is a silently unmet requirement.

`--category <slug>` restricts which categories are counted, but never which counts they are held to.
"""

from __future__ import annotations

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories, records

_ID = "ALLOCATION_EXACT"
_SPLITS = ("DEVELOPMENT", "VALIDATION", "BLIND")


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    in_scope = categories(dataset, context.category)
    known = {entry.slug for entry in in_scope}

    for entry in in_scope:
        expected = dataset.allocation_for(entry.slug)
        if expected is None:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    None,
                    "the category directory has no row in evals/splits/allocation.yaml",
                    str(entry.path),
                )
            )
            continue
        counted = {name: 0 for name in _SPLITS}
        for _case_id, split, _path, _raw in records(entry):
            if split in counted:
                counted[split] += 1
        for name in _SPLITS:
            wanted = {
                "DEVELOPMENT": expected.development,
                "VALIDATION": expected.validation,
                "BLIND": expected.blind,
            }[name]
            if counted[name] != wanted:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        None,
                        f"{name} count is {counted[name]}, allocation.yaml requires exactly {wanted}",
                        str(entry.path),
                    )
                )
        total = sum(counted.values())
        if total != expected.total:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    None,
                    f"total count is {total}, allocation.yaml requires exactly {expected.total}",
                    str(entry.path),
                )
            )

    if context.category is None:
        for row in dataset.allocation:
            if row.slug not in known:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        row.slug,
                        None,
                        "allocation.yaml declares this category and no directory exists for it",
                        str(dataset.root / "cases" / row.slug),
                    )
                )
    return findings
