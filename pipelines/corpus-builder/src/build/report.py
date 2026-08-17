"""`gate-report.json` — why a build was accepted or rejected (CRPS-06 deliverable 7).

WRITTEN OUTSIDE THE BUNDLE, ALWAYS. The manifest hashes every file in the bundle, so a report
written inside it would either change `artifacts.*` or be reported as `BUNDLE_FILE_UNLISTED` by the
bundle's own verifier. The report and the release diff are therefore SIBLINGS of the bundle
directory, named from the release id (`<release_id>-gate-report.json`) so that two builds sharing
one `output_dir` cannot collide.

A `REJECTED` BUILD STILL WRITES THE REPORT. An operator must be able to see why a release was
refused without re-running the build — `ADM-001` internal visibility, PRD §12.2.

A GATE IS NEVER SIMPLY ABSENT. All eight PRD §12.2 gates appear in `gates[]` in every report,
including as `status: "NOT_RUN"` with the reason as a finding. An absent entry would be
indistinguishable from a gate that silently did not run.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from validation.codes import GATE_NAMES
from validation.findings import GateResult, counts_of

from .measure import Measurements

__all__ = ["DECISIONS", "GateReport", "gate_report_path", "release_diff_path", "write_gate_report"]

#: Deliverable 7's decision vocabulary. There is no third state: a build either produced a bundle at
#: the final path or it did not.
DECISIONS: tuple[str, ...] = ("BUILT", "REJECTED")


@dataclass(frozen=True)
class GateReport:
    release_id: str
    release_kind: str
    started_at: str
    finished_at: str
    gates: tuple[GateResult, ...]
    decision: str
    measurements: Measurements | None = None
    staging_cleaned: bool = False
    staging_note: str | None = None
    index_builder_id: str | None = None

    def __post_init__(self) -> None:
        if self.decision not in DECISIONS:
            raise ValueError(f"decision must be one of {DECISIONS!r}, got {self.decision!r}")
        recorded = tuple(result.gate for result in self.gates)
        if recorded != GATE_NAMES:
            raise ValueError(
                "a gate report must record all eight PRD §12.2 gates in order — a gate that did "
                f"not run says so with status NOT_RUN. Got {recorded!r}, expected {GATE_NAMES!r}"
            )

    @property
    def all_findings(self) -> tuple[Any, ...]:
        return tuple(finding for result in self.gates for finding in result.findings)

    def to_dict(self) -> dict[str, Any]:
        blocking_count, anomaly_count = counts_of(list(self.all_findings))
        return {
            "release_id": self.release_id,
            "release_kind": self.release_kind,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "gates": [result.to_dict() for result in self.gates],
            "blocking_count": blocking_count,
            "anomaly_count": anomaly_count,
            "decision": self.decision,
            "measurements": None if self.measurements is None else self.measurements.to_dict(),
            "index_builder_id": self.index_builder_id,
            "staging": {"cleaned": self.staging_cleaned, "note": self.staging_note},
        }


def gate_report_path(output_dir: Path, release_id: str) -> Path:
    return Path(output_dir) / f"{release_id}-gate-report.json"


def release_diff_path(output_dir: Path, release_id: str) -> Path:
    return Path(output_dir) / f"{release_id}-release-diff.json"


def write_json_atomically(document: Any, path: Path) -> None:
    """Deterministic JSON, written temp-then-`os.replace`.

    Atomic for the same reason `manifest.write_manifest` is: a crash mid-write must not leave a
    half-written report that reads as corruption rather than as an aborted build.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = (
        json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n"
    ).encode("utf-8")
    temporary = target.with_name(target.name + ".partial")
    temporary.write_bytes(payload)
    os.replace(temporary, target)


def write_gate_report(report: GateReport, path: Path) -> Path:
    write_json_atomically(report.to_dict(), path)
    return Path(path)


def results_for(gates: Sequence[GateResult]) -> tuple[GateResult, ...]:
    """Order *gates* into PRD §12.2 order, inserting `NOT_RUN` for any that is absent."""
    by_name = {result.gate: result for result in gates}
    return tuple(
        by_name.get(name, GateResult(gate=name, status="NOT_RUN", findings=()))
        for name in GATE_NAMES
    )
