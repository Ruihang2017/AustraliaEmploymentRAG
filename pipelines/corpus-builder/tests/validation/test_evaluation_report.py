"""The evaluation report contract: absent, malformed, failed and passing are four distinct states."""

from __future__ import annotations

import json
from pathlib import Path

from validation.evaluation_report import load_evaluation_report, summary_of

_GOOD = {
    "report_id": "eval-1",
    "ran_at": "2026-01-01T00:00:00Z",
    "metrics": {"recall_at_10": "0.87"},
    "gates": [
        {"name": "recall_at_10", "threshold": "0.80", "observed": "0.87", "passed": True}
    ],
}


def _write(tmp_path: Path, document: object) -> Path:
    path = tmp_path / "evaluation-report.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def test_absent_is_reported_as_absent_not_malformed(tmp_path: Path) -> None:
    """An absent file yields NO findings: whether that is allowed depends on `release_kind` and
    `allow_not_run_evaluation`, which is the gate's decision, not this loader's."""
    report, findings = load_evaluation_report(tmp_path / "nothing.json")
    assert report is None
    assert findings == []


def test_a_passing_report_round_trips(tmp_path: Path) -> None:
    report, findings = load_evaluation_report(_write(tmp_path, _GOOD))
    assert findings == []
    assert report is not None
    assert report.report_id == "eval-1"
    assert report.failed_gates == ()
    assert summary_of(report).status == "PASSED"


def test_a_failed_gate_is_visible_and_the_summary_says_failed(tmp_path: Path) -> None:
    document = json.loads(json.dumps(_GOOD))
    document["gates"][0]["passed"] = False
    document["gates"][0]["observed"] = "0.61"
    report, findings = load_evaluation_report(_write(tmp_path, document))
    assert findings == []
    assert report is not None and len(report.failed_gates) == 1
    assert summary_of(report).status == "FAILED"


def test_unparseable_json_is_malformed(tmp_path: Path) -> None:
    path = tmp_path / "evaluation-report.json"
    path.write_text("{not json", encoding="utf-8")
    report, findings = load_evaluation_report(path)
    assert report is None
    assert [finding.code for finding in findings] == ["EVALUATION_REPORT_MALFORMED"]
    assert findings[0].severity == "BLOCKING"


def test_a_float_metric_is_malformed(tmp_path: Path) -> None:
    """Decimal strings, never floats: the manifest is signed and a verifier must re-derive
    identical canonical bytes, so a float is not representable."""
    document = json.loads(json.dumps(_GOOD))
    document["metrics"]["recall_at_10"] = 0.87
    report, findings = load_evaluation_report(_write(tmp_path, document))
    assert report is None
    assert {finding.code for finding in findings} == {"EVALUATION_REPORT_MALFORMED"}


def test_a_float_threshold_is_malformed(tmp_path: Path) -> None:
    document = json.loads(json.dumps(_GOOD))
    document["gates"][0]["threshold"] = 0.8
    report, findings = load_evaluation_report(_write(tmp_path, document))
    assert report is None
    assert findings


def test_a_missing_report_id_is_malformed(tmp_path: Path) -> None:
    document = json.loads(json.dumps(_GOOD))
    del document["report_id"]
    report, findings = load_evaluation_report(_write(tmp_path, document))
    assert report is None
    assert any("report_id" in finding.subject for finding in findings)


def test_a_non_timestamp_ran_at_is_malformed(tmp_path: Path) -> None:
    document = json.loads(json.dumps(_GOOD))
    document["ran_at"] = "2026-01-01"
    report, findings = load_evaluation_report(_write(tmp_path, document))
    assert report is None
    assert any("ran_at" in finding.subject for finding in findings)


def test_broken_gold_citations_metric_is_read_when_present(tmp_path: Path) -> None:
    document = json.loads(json.dumps(_GOOD))
    document["metrics"]["broken_gold_citations"] = "3"
    report, _ = load_evaluation_report(_write(tmp_path, document))
    assert report is not None and report.broken_gold_citations == 3


def test_an_absent_broken_gold_metric_reads_as_unreported(tmp_path: Path) -> None:
    report, _ = load_evaluation_report(_write(tmp_path, _GOOD))
    assert report is not None and report.broken_gold_citations == 0
