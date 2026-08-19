"""GOLD-01 — the evaluation dataset contract and its enforcement.

This package is deliberately **stdlib-only**. No third-party Python package is importable in the
environment `uv sync --frozen && uv run pytest` builds at the repository root (the root manifest is
a virtual project and every workspace member is `package = false`, so a member's dependency is
locked but never installed), and the root manifest is PRD §44.3 serial-owned by `00-foundation`.
`yaml_min` and `sealedbox` exist for that reason, and each says so in its own header.

Import convention (CRPS-01's, do not invent another): modules under `pipelines/<member>/src/` are
**top-level** modules rooted at that directory. This package is therefore `dataset`, and the tests
prepend `pipelines/evaluation/src` from `tests/dataset/dataset_fixtures.py`.
"""

from __future__ import annotations

from .findings import CHECK_IDS, Finding, Severity, blocking, finding_ids
from .paths import CASES_DIR, EVALS_DIR, REPO_ROOT, SCHEMAS_DIR, SPLITS_DIR, repo_root

__all__ = [
    "CASES_DIR",
    "CHECK_IDS",
    "EVALS_DIR",
    "Finding",
    "REPO_ROOT",
    "SCHEMAS_DIR",
    "SPLITS_DIR",
    "Severity",
    "blocking",
    "finding_ids",
    "repo_root",
]
