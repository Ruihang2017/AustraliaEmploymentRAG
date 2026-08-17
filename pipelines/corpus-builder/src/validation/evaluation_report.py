"""The evaluation report contract the gate consumes (CRPS-06 deliverable 4.7).

`21-evaluation-600` PRODUCES this file; this module only reads it. The dependency runs one way
(module 21 depends on module 04, never the reverse), which is why the gate consumes a report FILE
and never runs an evaluation harness.

THE MINIMAL CONTRACT, exactly as the ticket declares it:

    {report_id, ran_at, metrics: {name: value}, gates: [{name, threshold, observed, passed}]}

THRESHOLDS AND OBSERVED VALUES ARE DECIMAL STRINGS, never floats, and that is not a stylistic
choice: the values flow into `manifest.EvaluationSummary`, which goes into a SIGNED manifest whose
canonical bytes a Rust verifier must re-derive exactly (`manifest/canonical.py`). A float would make
the signature depend on a formatting decision. A JSON number here is therefore MALFORMED, not
coerced — see `manifest/model.py`'s `EvaluationSummary` docstring for the same rule stated from the
other side.

MALFORMED IS NOT MISSING. A report that cannot be parsed, or whose shape is wrong, is
`EVALUATION_REPORT_MALFORMED` and BLOCKING under EVERY `release_kind` — including where a missing
report would have been allowed by `allow_not_run_evaluation`. Reading "the file was corrupt" as
"there was no evaluation" is the failure mode that would let a broken harness silently release.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Mapping

from manifest import EvaluationGate, EvaluationSummary

from .findings import Finding

__all__ = [
    "EvaluationReport",
    "EvaluationReportGate",
    "load_evaluation_report",
    "summary_of",
]

_DECIMAL = re.compile(r"^-?[0-9]+(\.[0-9]+)?$")
_TIMESTAMP = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$")


@dataclass(frozen=True)
class EvaluationReportGate:
    name: str
    threshold: str
    observed: str
    passed: bool


@dataclass(frozen=True)
class EvaluationReport:
    report_id: str
    ran_at: str
    metrics: Mapping[str, str]
    gates: tuple[EvaluationReportGate, ...]

    @property
    def failed_gates(self) -> tuple[EvaluationReportGate, ...]:
        return tuple(gate for gate in self.gates if not gate.passed)

    @property
    def broken_gold_citations(self) -> Decimal:
        """PRD §40.9's "broken gold citation" count, when the harness reports one.

        Read from the `broken_gold_citations` metric because the minimal contract has no dedicated
        member for it. Absent means "the harness did not report it", which is not zero — the citation
        gate treats a non-zero count as BLOCKING and an absent one as simply unreported.

        `Decimal`, NOT `int(float(raw))`. Every metric in this contract is a DECIMAL STRING, so the
        value may legitimately be fractional (a rate, or a harness that reports a weighted count).
        `int(float("0.5"))` is `0`, which is falsy, which silently turned "the harness found broken
        gold citations" into "it did not" — the exact BLOCKING finding PRD §40.9 requires would never
        have been emitted. `Decimal` also avoids binary-float rounding on a value that arrived as
        text and is compared against zero. A NEGATIVE value is nonsense for a count and is therefore
        also reported rather than treated as "none": the gate's test is `!= 0`, not `> 0`.
        """
        raw = self.metrics.get("broken_gold_citations")
        if raw is None or not _DECIMAL.match(raw):
            return Decimal(0)
        try:
            return Decimal(raw)
        except InvalidOperation:  # pragma: no cover — `_DECIMAL` already constrains the shape
            return Decimal(0)


def _malformed(message: str, subject: str) -> Finding:
    return Finding(
        gate="evaluation",
        code="EVALUATION_REPORT_MALFORMED",
        severity="BLOCKING",
        message=message,
        subject=subject,
    )


def load_evaluation_report(path: Path) -> tuple[EvaluationReport | None, list[Finding]]:
    """`(report, findings)`. A `None` report with no findings means the file was ABSENT.

    Absence is the caller's decision to grade (it depends on `release_kind` and
    `allow_not_run_evaluation`); every other failure is graded here, as BLOCKING.
    """
    target = Path(path)
    if not target.is_file():
        return None, []
    try:
        document: Any = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        return None, [
            _malformed(
                f"the evaluation report at {target.name} is not readable JSON: "
                f"{type(error).__name__}",
                "evaluation_report",
            )
        ]
    if not isinstance(document, dict):
        return None, [
            _malformed(
                f"the evaluation report at {target.name} does not contain a JSON object",
                "evaluation_report",
            )
        ]

    findings: list[Finding] = []
    report_id = document.get("report_id")
    if not isinstance(report_id, str) or not report_id:
        findings.append(_malformed("report_id is absent or not a string", "evaluation_report.report_id"))
    ran_at = document.get("ran_at")
    if not isinstance(ran_at, str) or not _TIMESTAMP.match(ran_at):
        findings.append(
            _malformed(
                "ran_at is absent or is not a PRD §35.1 UTC timestamp (YYYY-MM-DDThh:mm:ssZ)",
                "evaluation_report.ran_at",
            )
        )

    raw_metrics = document.get("metrics")
    metrics: dict[str, str] = {}
    if not isinstance(raw_metrics, dict):
        findings.append(_malformed("metrics is absent or is not an object", "evaluation_report.metrics"))
    else:
        for name, value in raw_metrics.items():
            if not isinstance(value, str) or not _DECIMAL.match(value):
                findings.append(
                    _malformed(
                        f"metrics[{name!r}] must be a DECIMAL STRING (the manifest is signed and a "
                        "verifier must re-derive identical bytes, so a float is not representable)",
                        f"evaluation_report.metrics.{name}",
                    )
                )
                continue
            metrics[str(name)] = value

    raw_gates = document.get("gates")
    gates: list[EvaluationReportGate] = []
    if not isinstance(raw_gates, list):
        findings.append(_malformed("gates is absent or is not an array", "evaluation_report.gates"))
    else:
        for index, entry in enumerate(raw_gates):
            subject = f"evaluation_report.gates[{index}]"
            if not isinstance(entry, dict):
                findings.append(_malformed(f"{subject} is not an object", subject))
                continue
            name = entry.get("name")
            threshold = entry.get("threshold")
            observed = entry.get("observed")
            passed = entry.get("passed")
            if not isinstance(name, str) or not name:
                findings.append(_malformed(f"{subject}.name is absent or not a string", subject))
                continue
            if not isinstance(threshold, str) or not _DECIMAL.match(threshold):
                findings.append(
                    _malformed(f"{subject}.threshold must be a decimal string", f"{subject}.threshold")
                )
                continue
            if not isinstance(observed, str) or not _DECIMAL.match(observed):
                findings.append(
                    _malformed(f"{subject}.observed must be a decimal string", f"{subject}.observed")
                )
                continue
            if not isinstance(passed, bool):
                findings.append(
                    _malformed(f"{subject}.passed must be a boolean", f"{subject}.passed")
                )
                continue
            gates.append(
                EvaluationReportGate(
                    name=name, threshold=threshold, observed=observed, passed=passed
                )
            )

    if findings:
        return None, findings
    assert isinstance(report_id, str) and isinstance(ran_at, str)
    return (
        EvaluationReport(
            report_id=report_id, ran_at=ran_at, metrics=metrics, gates=tuple(gates)
        ),
        [],
    )


def summary_of(report: EvaluationReport) -> EvaluationSummary:
    """Convert to the manifest's `evaluation` member.

    `status` is `PASSED` only when every gate passed. The not-run shape is
    `manifest.not_run_evaluation()`, produced by the caller, so that `NOT_RUN` is always visible in
    the manifest rather than being mistakable for an absent member.
    """
    return EvaluationSummary(
        status="PASSED" if not report.failed_gates else "FAILED",
        report_id=report.report_id,
        ran_at=report.ran_at,
        metrics=dict(report.metrics),
        gates=tuple(
            EvaluationGate(
                name=gate.name,
                threshold=gate.threshold,
                observed=gate.observed,
                passed=gate.passed,
            )
            for gate in report.gates
        ),
    )
