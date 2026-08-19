"""`SPLIT_DISJOINT` — each id appears in exactly one split, and in exactly one category.

This IS requirement `EVAL-001`'s named test: PRD §30.2, "Split integrity/no-overlap test passes". An
id present in two splits makes a blind result meaningless, because the same case was also used to
develop against.

It always runs over the WHOLE dataset even under `--category`: an overlap is by definition a
relationship between two categories, and a check scoped to one of them could not see it.
"""

from __future__ import annotations

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import records

_ID = "SPLIT_DISJOINT"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    del context  # deliberate: an overlap spans categories, so this is never scoped to one
    findings: list[Finding] = []
    placements: dict[str, list[tuple[str, str, str]]] = {}

    for entry in dataset.categories:
        for case_id, split, path, _raw in records(entry):
            if not isinstance(case_id, str) or not case_id:
                continue
            placements.setdefault(case_id, []).append((entry.slug, split, path))

    for case_id, seen in sorted(placements.items()):
        if len(seen) == 1:
            continue
        splits = {split for _slug, split, _path in seen}
        slugs = {slug for slug, _split, _path in seen}
        if len(splits) > 1:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    sorted(slugs)[0],
                    case_id,
                    f"id appears in {len(splits)} splits ({', '.join(sorted(splits))}); each id "
                    "belongs to exactly one",
                    seen[0][2],
                )
            )
        if len(slugs) > 1:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    sorted(slugs)[0],
                    case_id,
                    f"id appears in {len(slugs)} categories ({', '.join(sorted(slugs))})",
                    seen[0][2],
                )
            )
        if len(splits) == 1 and len(slugs) == 1:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    sorted(slugs)[0],
                    case_id,
                    f"id appears {len(seen)} times in one category",
                    seen[0][2],
                )
            )
    return findings
