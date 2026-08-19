"""`COMPLETE_DATASET` (`--complete` only) — the whole-dataset invariant `GOLD-17` runs.

Two things, from the ticket's deliverable 12 row 12 (PRD §14.1, §43.1):

1. the composed totals equal the allocation's totals exactly. Against the repository's own
   `evals/splits/allocation.yaml` that IS 360 / 120 / 120 / 600 — the frozen data is asserted equal
   to the PRD table row for row by `tests/dataset/test_allocation_frozen.py`, so comparing against
   the allocation rather than against four literals keeps one source of the numbers instead of two;
2. the sub-PRD's cross-cutting floors hold: every `product_surface` and every canonical
   `AnswerStatus` member is represented somewhere in the dataset (PRD §43.1, "cross-tags ensure
   every product surface and answer status is represented").

It runs ONLY under `--complete` because every partial dataset fails it by construction, and a check
that always fails is a check everyone learns to ignore. `GOLD-17` is where it must pass.

Note which population each floor is computed over: `product_surface` is on the blind sidecar
allowlist, so surfaces count blind slots too; `expected_answer_status` is not (it is the answer), so
statuses count visible cases only.
"""

from __future__ import annotations

import json
from collections import Counter

from .. import contract_enums
from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import records

_ID = "COMPLETE_DATASET"
_SPLITS = ("DEVELOPMENT", "VALIDATION", "BLIND")


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    if not dataset.allocation:
        return [
            Finding(
                _ID,
                "FAIL",
                "<dataset>",
                None,
                "no allocation.yaml was found, so completeness cannot be established",
                str(dataset.root),
            )
        ]

    counted: Counter[str] = Counter()
    surfaces: Counter[str] = Counter()
    statuses: Counter[str] = Counter()
    for entry in dataset.categories:
        for _case_id, split, _path, raw in records(entry):
            counted[split] += 1
            if isinstance(raw, dict):
                surface = raw.get("product_surface")
                if isinstance(surface, str):
                    surfaces[surface] += 1
                if split != "BLIND":
                    status = raw.get("expected_answer_status")
                    if isinstance(status, str):
                        statuses[status] += 1

    wanted = {
        "DEVELOPMENT": sum(row.development for row in dataset.allocation),
        "VALIDATION": sum(row.validation for row in dataset.allocation),
        "BLIND": sum(row.blind for row in dataset.allocation),
    }
    for split in _SPLITS:
        if counted[split] != wanted[split]:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    "<dataset>",
                    None,
                    f"{split} total is {counted[split]}, allocation.yaml requires exactly {wanted[split]}",
                    str(dataset.root),
                )
            )
    total, wanted_total = sum(counted.values()), sum(row.total for row in dataset.allocation)
    if total != wanted_total:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                "<dataset>",
                None,
                f"dataset total is {total}, allocation.yaml requires exactly {wanted_total}",
                str(dataset.root),
            )
        )

    for surface in _declared_surfaces(context):
        if surfaces[surface] == 0:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    "<dataset>",
                    None,
                    f"no case carries product_surface {surface}; PRD §43.1 requires every product "
                    "surface to be represented",
                    str(dataset.root),
                )
            )

    try:
        canonical = contract_enums.answer_statuses()
    except contract_enums.MissingEnumFamilyError as error:
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                "<dataset>",
                None,
                f"the canonical AnswerStatus family could not be read ({type(error).__name__}); "
                "owner FND-03",
                str(dataset.root),
            )
        )
        canonical = ()
    for status in canonical:
        if statuses[status] == 0:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    "<dataset>",
                    None,
                    f"no visible case carries expected_answer_status {status}; PRD §43.1 requires "
                    "every answer status to be represented",
                    str(dataset.root),
                )
            )
    return findings


def _declared_surfaces(context: CheckContext) -> tuple[str, ...]:
    """The surface vocabulary, read from `case.schema.json` rather than restated here."""
    document = json.loads((context.schemas_dir / "case.schema.json").read_text(encoding="utf-8"))
    values = document["properties"]["product_surface"]["enum"]
    return tuple(values)
