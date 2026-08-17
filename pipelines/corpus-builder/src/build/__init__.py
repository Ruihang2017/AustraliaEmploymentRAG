"""`build` — the candidate release build (CRPS-06).

IMPORT CONVENTION (fixed by CRPS-01): directories under `pipelines/corpus-builder/src/` are
TOP-LEVEL modules rooted at that directory, so this package is imported as `build`, alongside
`contracts`, `chunking`, `tiering`, `manifest` and `validation`.

THE MODULE NAME `build`, and the CLI name — a recorded deviation. Deliverable 10 writes the
invocation as `uv run python -m corpus_builder build-candidate …`, but there is no importable
`corpus_builder` module: `src/` holds top-level modules and the member-root package is the empty
`taxrag_pipeline_corpus_builder/`. Creating `src/corpus_builder/` would leave this ticket's declared
file-scope. The invocation is therefore

    PYTHONPATH=pipelines/corpus-builder/src uv run python -m build build-candidate …

which matches the precedent CRPS-05 already recorded for `python -m embeddings`. The deviation is
reported as a ticket-wording writeback. Note also the cosmetic collision with PyPI's `build`
frontend: it is inert here — nothing in this workspace imports that package, and the name exists
only on a `sys.path` root this repository controls — so it is stated rather than "fixed".

THE ORDERING CONSTRAINT (deliverable 11) — do not reorder, and read `assemble.py` before changing
anything about it:

    assemble (into .staging/) -> gates A -> manifest build -> sign -> gates B (verify_bundle)
        -> [no BLOCKING finding] -> ONE os.replace() into the final path

No artifact reaches the final path before every gate has passed, because the final path is created
by a single directory rename performed after the last gate.
"""

from __future__ import annotations

from .assemble import (
    BuildOutcome,
    BundlePaths,
    FinalPathExists,
    StagingNotEmpty,
    assemble_bundle,
    stage_bundle,
)
from .diff import CHANGE_TYPES, DocumentChange, ReleaseDiff, release_diff, write_release_diff
from .indexes import (
    INDEX_STATE_FILENAME,
    INDEX_VERSION_ABSENT_SENTINEL,
    IndexBuildFailed,
    IndexBuildResult,
    LexicalIndexBuilder,
    NullLexicalIndexBuilder,
)
from .measure import Measurements, measure
from .plan import BuildRequest, InvalidBuildRequest, load_model_pins, load_runtime_pin
from .report import GateReport, gate_report_path, release_diff_path, write_gate_report

__all__ = [
    "CHANGE_TYPES",
    "INDEX_STATE_FILENAME",
    "INDEX_VERSION_ABSENT_SENTINEL",
    "BuildOutcome",
    "BuildRequest",
    "BundlePaths",
    "DocumentChange",
    "FinalPathExists",
    "GateReport",
    "Measurements",
    "ReleaseDiff",
    "StagingNotEmpty",
    "assemble_bundle",
    "gate_report_path",
    "measure",
    "release_diff",
    "release_diff_path",
    "stage_bundle",
    "write_gate_report",
    "write_release_diff",
    "IndexBuildFailed",
    "IndexBuildResult",
    "InvalidBuildRequest",
    "LexicalIndexBuilder",
    "NullLexicalIndexBuilder",
    "load_model_pins",
    "load_runtime_pin",
]
