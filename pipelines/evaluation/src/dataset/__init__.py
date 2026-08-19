"""GOLD-01 — the evaluation dataset contract and its enforcement.

This package is deliberately **stdlib-only**. No third-party Python package is importable in the
environment `uv sync --frozen && uv run pytest` builds at the repository root (the root manifest is
a virtual project and every workspace member is `package = false`, so a member's dependency is
locked but never installed), and the root manifest is PRD §44.3 serial-owned by `00-foundation`.
`yaml_min` and `sealedbox` exist for that reason, and each says so in its own header.

Import convention (CRPS-01's, do not invent another): modules under `pipelines/<member>/src/` are
**top-level** modules rooted at that directory. This package is therefore `dataset`, and the tests
prepend `pipelines/evaluation/src` from `tests/dataset/dataset_fixtures.py`.

Public surface, in the order the ticket's deliverables introduce it:

    compose(root)                     deliverable 11 — discover, never index (sub-PRD D4)
    run_checks(dataset, context)      deliverable 12 — the twelve checks, in registry order
    seal / open_blind / guard         deliverable 13 — the mechanical blind control
    Finding / Severity                content-free findings (breakdown plan §8 Q6 item 15)
"""

from __future__ import annotations

from .blind import (
    BlindKeyUnavailable,
    BlindLeakDetected,
    BlindMaterialNotRenderable,
    SealedCase,
    assert_no_blind_leakage,
    guard,
    leak_shingles,
    open_blind,
    seal,
)
from .checks import CHECKS, CheckContext, run_checks
from .compose import compose
from .findings import CHECK_IDS, Finding, Severity, blocking, finding_ids
from .model import (
    BlindSidecar,
    Case,
    Dataset,
    DatasetVersion,
    GoldAuthority,
    Migration,
    PrimaryCategory,
    SealedEnvelope,
    Split,
    Stratification,
)
from .paths import CASES_DIR, EVALS_DIR, REPO_ROOT, SCHEMAS_DIR, SPLITS_DIR, repo_root

__all__ = [
    "BlindKeyUnavailable",
    "BlindLeakDetected",
    "BlindMaterialNotRenderable",
    "BlindSidecar",
    "CASES_DIR",
    "CHECKS",
    "CHECK_IDS",
    "Case",
    "CheckContext",
    "Dataset",
    "DatasetVersion",
    "EVALS_DIR",
    "Finding",
    "GoldAuthority",
    "Migration",
    "PrimaryCategory",
    "REPO_ROOT",
    "SCHEMAS_DIR",
    "SPLITS_DIR",
    "SealedCase",
    "SealedEnvelope",
    "Severity",
    "Split",
    "Stratification",
    "assert_no_blind_leakage",
    "blocking",
    "compose",
    "finding_ids",
    "guard",
    "leak_shingles",
    "open_blind",
    "repo_root",
    "run_checks",
    "seal",
    "repo_root",
]
