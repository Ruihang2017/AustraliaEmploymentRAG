"""`gate-report.json`'s shape, its placement, and its refusal to omit a gate."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

import pytest
from candidate_fixtures import Candidate
from candidate_paths import SRC  # noqa: F401

from build import assemble_bundle
from build.report import (
    GateReport,
    gate_report_path,
    release_diff_path,
    write_gate_report,
)
from validation.codes import GATE_NAMES
from validation.findings import Finding, GateResult


def _results(**statuses: str) -> tuple[GateResult, ...]:
    return tuple(
        GateResult(gate=name, status=statuses.get(name, "PASSED"), findings=())
        for name in GATE_NAMES
    )


def test_the_report_carries_the_ticket_s_shape(tmp_path: Path) -> None:
    report = GateReport(
        release_id="rel-1",
        release_kind="CANDIDATE",
        started_at="2026-01-01T00:00:00Z",
        finished_at="2026-01-01T00:01:00Z",
        gates=_results(),
        decision="BUILT",
    )
    document = json.loads(write_gate_report(report, tmp_path / "r.json").read_text(encoding="utf-8"))
    assert set(document) >= {
        "release_id",
        "release_kind",
        "started_at",
        "finished_at",
        "gates",
        "blocking_count",
        "anomaly_count",
        "decision",
    }
    assert document["blocking_count"] == 0 and document["anomaly_count"] == 0


def test_a_report_missing_a_gate_is_refused_at_construction() -> None:
    with pytest.raises(ValueError):
        GateReport(
            release_id="rel-1",
            release_kind="CANDIDATE",
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:01:00Z",
            gates=_results()[:-1],
            decision="BUILT",
        )


def test_an_unknown_decision_is_refused() -> None:
    with pytest.raises(ValueError):
        GateReport(
            release_id="rel-1",
            release_kind="CANDIDATE",
            started_at="2026-01-01T00:00:00Z",
            finished_at="2026-01-01T00:01:00Z",
            gates=_results(),
            decision="PROBABLY_FINE",
        )


def test_counts_are_derived_from_the_findings_not_declared(tmp_path: Path) -> None:
    findings = (
        Finding(
            gate="citation",
            code="CITATION_NODE_UNCHUNKED",
            severity="ANOMALY",
            message="m",
            subject="s",
        ),
        Finding(
            gate="citation",
            code="CITATION_CHUNK_HASH_MISMATCH",
            severity="BLOCKING",
            message="m",
            subject="s",
        ),
    )
    gates = tuple(
        GateResult(gate=name, status="FAILED" if name == "citation" else "PASSED",
                   findings=findings if name == "citation" else ())
        for name in GATE_NAMES
    )
    report = GateReport(
        release_id="rel-1",
        release_kind="CANDIDATE",
        started_at="2026-01-01T00:00:00Z",
        finished_at="2026-01-01T00:01:00Z",
        gates=gates,
        decision="REJECTED",
    )
    document = json.loads(write_gate_report(report, tmp_path / "r.json").read_text(encoding="utf-8"))
    assert document["blocking_count"] == 1
    assert document["anomaly_count"] == 1


def test_the_report_paths_are_keyed_by_release_id(tmp_path: Path) -> None:
    """Two builds sharing one `output_dir` must not collide."""
    assert gate_report_path(tmp_path, "rel-a") != gate_report_path(tmp_path, "rel-b")
    assert release_diff_path(tmp_path, "rel-a") != gate_report_path(tmp_path, "rel-a")


def test_a_finding_s_evidence_is_capped_and_carries_no_document_text() -> None:
    """PRD §11.1: a release may contain restricted licensed material, and the report is written
    outside the bundle. Identifiers, counts, offsets and hashes are the vocabulary; text is not."""
    finding = Finding(
        gate="citation",
        code="CITATION_CHUNK_HASH_MISMATCH",
        severity="BLOCKING",
        message="m",
        subject="s",
        evidence={"excerpt": "x" * 5000},
    )
    assert len(finding.evidence["excerpt"]) < 300
    assert finding.evidence["excerpt"].endswith("[truncated]")


def test_a_failed_publish_never_leaves_a_built_report_behind(
    candidate_factory: Callable[..., Candidate], monkeypatch
) -> None:
    """REGRESSION (reviewer, MEDIUM). A `decision: BUILT` report must not outlive a failed rename.

    The report was previously written BEFORE the terminal `os.replace`, so a crash, a kill or a
    permission/disk failure in that window left an on-disk report claiming BUILT while no bundle
    existed at the final path — misleading precisely the operator or automated verifier the report
    exists to inform. The move now happens first, and a failed move is a REJECTED build with a
    stated `BUNDLE_PUBLISH_FAILED` reason.
    """
    candidate = candidate_factory()

    original = Path.replace

    def failing_replace(self: Path, target):  # type: ignore[no-untyped-def]
        # ONLY the terminal publication move: the final path is `corpus-release-<release_id>`.
        if Path(target).name.startswith("corpus-release-"):
            raise PermissionError("the final path could not be written")
        return original(self, target)

    monkeypatch.setattr(Path, "replace", failing_replace)
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    monkeypatch.undo()

    assert outcome.decision == "REJECTED"
    document = json.loads(outcome.gate_report_path.read_text(encoding="utf-8"))
    assert document["decision"] == "REJECTED"
    codes = {
        finding["code"]
        for gate in document["gates"]
        for finding in gate["findings"]
    }
    assert "BUNDLE_PUBLISH_FAILED" in codes
    assert not (candidate.output_dir / f"corpus-release-{candidate.release_id}").exists()


def test_the_written_report_is_deterministic_json(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    text = outcome.gate_report_path.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert json.dumps(json.loads(text), sort_keys=True, indent=2, ensure_ascii=False) + "\n" == text
