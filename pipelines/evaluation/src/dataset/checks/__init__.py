"""Deliverable 12 — one module per check, so a Reviewer can read a rule beside the PRD.

Every check is a pure `(dataset, context) -> list[Finding]`. None of them writes a file, opens a
network connection, reads an environment variable or mutates the dataset. `CHECKS` is an ordered
tuple and `tests/dataset/test_checks_registry.py` asserts it holds exactly the twelve ids the
ticket's table declares, in that order — a check cannot be quietly dropped, and one cannot be
quietly added under an id nobody agreed to.

`UNRESOLVED` is never a pass (sub-PRD D11). Two checks report it by design on a correct dataset:
`SCHEMA_VALID` while `packages/contracts` publishes no `Jurisdiction` family, and `GOLD_RESOLVES`
without `--release`. That means `verify` exits non-zero on a dataset with nothing wrong with it.
That is intended and must never be "fixed" by defaulting a check to pass — an unresolved gold
citation is PRD §40.9's blocking condition at release. Assert finding IDS in tests, not exit codes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

from ..findings import PRIVATE_MATERIAL_CHECK_ID, Finding
from ..model import Dataset

__all__ = ["CHECKS", "CheckContext", "run_checks"]


@dataclass(frozen=True, slots=True)
class CheckContext:
    """Everything a check may consult beyond the dataset itself."""

    schemas_dir: Path
    #: `--release <bundle-dir>`: without it `GOLD_RESOLVES` reports UNRESOLVED and never passes.
    release: Path | None = None
    #: Trusted signer public keys for the release bundle, delegated to CRPS-02's verifier.
    release_public_keys: tuple[Path, ...] = ()
    #: `--complete`: run `COMPLETE_DATASET`, the whole-dataset invariant GOLD-17 uses.
    complete: bool = False
    #: `--category <slug>`: restrict every check to one category.
    category: str | None = None
    #: Opened blind material, supplied ONLY by a Founder-started blind stage. Empty everywhere else,
    #: which is why the content-sensitive part of NO_NEAR_DUPLICATES is scoped as it is.
    opened_blind: tuple[object, ...] = field(default=())


Check = Callable[[Dataset, CheckContext], list[Finding]]


def _registry() -> tuple[tuple[str, Check], ...]:
    from . import (
        allocation,
        blind_sealed,
        complete_dataset,
        gold_resolves,
        gold_shape,
        id_rules,
        near_duplicates,
        no_private_key,
        schema_valid,
        split_disjoint,
        stratification,
        versioned_corrections,
    )

    return (
        ("SCHEMA_VALID", schema_valid.check),
        ("ID_RULES", id_rules.check),
        ("ALLOCATION_EXACT", allocation.check),
        ("SPLIT_DISJOINT", split_disjoint.check),
        ("NO_NEAR_DUPLICATES", near_duplicates.check),
        ("STRATIFICATION_MET", stratification.check),
        ("GOLD_SHAPE", gold_shape.check),
        ("GOLD_RESOLVES", gold_resolves.check),
        ("VERSIONED_CORRECTIONS", versioned_corrections.check),
        ("BLIND_SEALED", blind_sealed.check),
        (PRIVATE_MATERIAL_CHECK_ID, no_private_key.check),
        ("COMPLETE_DATASET", complete_dataset.check),
    )


CHECKS: tuple[tuple[str, Check], ...] = _registry()


def run_checks(
    dataset: Dataset,
    context: CheckContext,
    *,
    only: Sequence[str] | None = None,
) -> list[Finding]:
    """Run every check in registry order and collect EVERY finding.

    A check is never skipped because an earlier one failed: an author fixing one rule must not have
    to re-run to discover the next. `COMPLETE_DATASET` runs only under `--complete` (it is the
    whole-dataset invariant, and every partial dataset would otherwise fail it).
    """
    findings: list[Finding] = []
    for check_id, check in CHECKS:
        if only is not None and check_id not in only:
            continue
        if check_id == "COMPLETE_DATASET" and not context.complete:
            continue
        findings.extend(check(dataset, context))
    return findings
