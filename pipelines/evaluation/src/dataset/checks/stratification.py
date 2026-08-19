"""`STRATIFICATION_MET` — each category satisfies its own `stratification.yaml` (PRD §43.1).

A category declares its floors; this check counts them. That indirection is what lets a BLIND slot
be checked at all: `tags`, `trap_types`, `jurisdictions` and `product_surface` are on the sidecar
allowlist, so jurisdiction, surface and trap floors are computed over visible cases AND blind
sidecars. `answer_status_floors` are the exception — `expected_answer_status` is deliberately NOT on
the allowlist (it is the answer), so status floors are computed over visible cases only, and a
category's declared status floor must be satisfiable from its visible cases. That is a real
constraint on the authoring tickets and is stated in `pipelines/evaluation/README.md`.

Q-GOLD-C: the per-jurisdiction floor is DECLARED per category, never derived from PRD §43.1's "at
least eight … each state/territory" — 8 × 8 = 64 exceeds `adjacent-regimes`' 60 primary cases, and
the Founder owns the resolution. Declaring it keeps the rule checkable without weakening
`ALLOCATION_EXACT`, which is requirement `EVAL-001` itself.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Mapping

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories, records

_ID = "STRATIFICATION_MET"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    for entry in categories(dataset, context.category):
        if entry.stratification is None:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    None,
                    "the category has no stratification.yaml, so its coverage claims are unverifiable",
                    str(entry.path),
                )
            )
            continue
        strat = entry.stratification

        if strat.category != entry.slug:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    None,
                    f"stratification.yaml declares category {strat.category!r}, which is not this directory",
                    str(strat.path),
                )
            )

        allocation_row = dataset.allocation_for(entry.slug)
        if allocation_row is not None:
            declared = strat.raw.get("counts")
            if isinstance(declared, Mapping):
                for name, value in (
                    ("development", allocation_row.development),
                    ("validation", allocation_row.validation),
                    ("blind", allocation_row.blind),
                    ("total", allocation_row.total),
                ):
                    if declared.get(name) != value:
                        findings.append(
                            Finding(
                                _ID,
                                "FAIL",
                                entry.slug,
                                None,
                                f"stratification.yaml declares {name}={declared.get(name)} while "
                                f"allocation.yaml requires {value}",
                                str(strat.path),
                            )
                        )
            if strat.code != allocation_row.code:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        None,
                        f"stratification.yaml declares code {strat.code!r}, allocation.yaml says "
                        f"{allocation_row.code!r}",
                        str(strat.path),
                    )
                )

        visible_raw = [case.raw for case in entry.cases]
        all_raw = [raw for _id, _split, _path, raw in records(entry) if isinstance(raw, Mapping)]

        findings.extend(
            _floors(entry.slug, strat, "jurisdiction_floors", _multi(all_raw, "jurisdictions"))
        )
        findings.extend(
            _floors(entry.slug, strat, "product_surface_floors", _single(all_raw, "product_surface"))
        )
        findings.extend(
            _floors(
                entry.slug,
                strat,
                "answer_status_floors",
                _single(visible_raw, "expected_answer_status"),
            )
        )

        present_traps = _multi(all_raw, "trap_types")
        for trap in strat.raw.get("required_trap_types") or []:
            if present_traps.get(trap, 0) == 0:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        None,
                        f"required trap type {trap!r} appears in no case in this category",
                        str(strat.path),
                    )
                )
    return findings


def _floors(
    slug: str, strat: Any, name: str, counted: Mapping[str, int]
) -> list[Finding]:
    findings: list[Finding] = []
    for key, minimum in strat.floors(name):
        actual = counted.get(key, 0)
        if actual < minimum:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    slug,
                    None,
                    f"{name}: {key} is present in {actual} case(s), the declared floor is {minimum}",
                    str(strat.path),
                )
            )
    return findings


def _single(rows: list[Mapping[str, Any]], field: str) -> Counter[str]:
    counter: Counter[str] = Counter()
    for raw in rows:
        value = raw.get(field)
        if isinstance(value, str):
            counter[value] += 1
    return counter


def _multi(rows: list[Mapping[str, Any]], field: str) -> Counter[str]:
    counter: Counter[str] = Counter()
    for raw in rows:
        values = raw.get(field)
        if isinstance(values, list):
            for value in values:
                if isinstance(value, str):
                    counter[value] += 1
    return counter
