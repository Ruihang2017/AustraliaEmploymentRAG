"""`validation` — the eight PRD §12.2 candidate-release gates (CRPS-06).

IMPORT CONVENTION (fixed by CRPS-01, restated in `manifest/__init__.py`): directories under
`pipelines/corpus-builder/src/` are TOP-LEVEL modules rooted at that directory — `contracts`,
`chunking`, `tiering`, `manifest`, and now `build` and `validation`. This package may read
`contracts`, `chunking`, `tiering` and `manifest`; none of them reads it.

WHAT A GATE IS. A callable `(BundleContext) -> list[Finding]` that NEVER RAISES — the contract
`chunking.validate_chunks()` already sets in this repository, and for the same reason: a gate that
throws on bad data is useless to a build whose whole job is to find bad data. `run_gates()` wraps
each call, so an unexpected exception becomes a BLOCKING `GATE_INTERNAL_ERROR` finding instead of an
internal error exit.

WHAT A GATE IS NOT. There is no `skip`, `force`, `only` or `disable` option anywhere in
`BuildRequest`, in the CLI or in the runner: a gate cannot be turned off for a `CANDIDATE`, and
`tests/validation/test_gates_cannot_be_disabled.py` asserts the absence by source scan.
"""

from __future__ import annotations

from .anomalies import (
    BLOCKING_CLASSES,
    COLLECTION_COUNT_CHANGE_FRACTION,
    PARSE_FAILURE_RATE,
    AnomalyThresholds,
)
from .codes import GATE_CODES, GATE_NAMES, OWN_GATE_CODES, Severity
from .context import BundleContext, read_only_connector
from .findings import Finding, GateResult, blocking, counts_of
from .gates import GATES, corpus_counts, merge_results, run_phase_a, run_phase_b

__all__ = [
    "GATES",
    "corpus_counts",
    "merge_results",
    "run_phase_a",
    "run_phase_b",
    "BLOCKING_CLASSES",
    "COLLECTION_COUNT_CHANGE_FRACTION",
    "GATE_CODES",
    "GATE_NAMES",
    "OWN_GATE_CODES",
    "PARSE_FAILURE_RATE",
    "AnomalyThresholds",
    "BundleContext",
    "Finding",
    "GateResult",
    "Severity",
    "blocking",
    "counts_of",
    "read_only_connector",
]
