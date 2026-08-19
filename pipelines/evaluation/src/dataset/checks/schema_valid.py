"""`SCHEMA_VALID` — every case validates against `case.schema.json`, every sidecar against
`blind-sidecar.schema.json` (PRD §43.2, §14.1).

Also carries the three constraints the available schema engine cannot express, each stated here so
a Reviewer can read the rule beside the PRD rather than inferring it from a missing keyword:

* `legal_as_at` must be a REAL calendar date (`format` is outside the engine's vocabulary);
* `expected_answer_status` and every `acceptable_statuses` member must belong to the canonical
  `AnswerStatus` family, read from the `packages/contracts` export at run time (PRD §45.2 forbids a
  second copy, so the schema carries no literal);
* `jurisdictions` can only be shape-validated, because `packages/contracts` publishes no
  `Jurisdiction` family. That is reported as `UNRESOLVED` — never as a pass, and never repaired by
  inventing an enum here. Owner: `FND-03`, by docs PR (GOLD-01 Feedback obligation 2).
"""

from __future__ import annotations

from typing import Any, Mapping

from .. import contract_enums, schema_engine
from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories, is_real_calendar_date

_ID = "SCHEMA_VALID"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    case_validator = schema_engine.validator_for("case.schema.json", context.schemas_dir)
    sidecar_validator = schema_engine.validator_for("blind-sidecar.schema.json", context.schemas_dir)
    envelope_validator = schema_engine.validator_for("blind-envelope.schema.json", context.schemas_dir)
    strat_validator = schema_engine.validator_for("stratification.schema.json", context.schemas_dir)

    try:
        statuses = set(contract_enums.answer_statuses())
        status_source: str | None = None
    except contract_enums.MissingEnumFamilyError as error:
        statuses = set()
        status_source = type(error).__name__

    for entry in categories(dataset, context.category):
        for path, reason in entry.unparseable:
            # `reason` is content-free by construction: `compose` builds it from
            # `YamlError.reason` (line number + construct) or an exception class name, never from
            # the file's text. The file may be a BLIND sidecar, so a message quoting the offending
            # fragment would leak blind content through the ordinary failure path — see the
            # `yaml_min` module header and `test_findings_content_free.py`.
            findings.append(
                Finding(_ID, "FAIL", entry.slug, None, f"file is unreadable or unparseable: {reason}", str(path))
            )

        if entry.stratification is not None:
            findings.extend(
                _validate(strat_validator, entry.stratification.raw, entry.slug, None, str(entry.stratification.path))
            )

        for case in entry.cases:
            findings.extend(_validate(case_validator, case.raw, entry.slug, case.id, str(case.path)))
            findings.extend(_beyond_schema(case.raw, entry.slug, case.id, str(case.path), statuses, status_source))

        for sidecar in entry.sidecars:
            findings.extend(
                _validate(sidecar_validator, sidecar.raw, entry.slug, sidecar.id, str(sidecar.path))
            )
            findings.extend(_jurisdiction_shape(sidecar.raw, entry.slug, sidecar.id, str(sidecar.path)))
            if sidecar.envelope is not None:
                findings.extend(
                    _validate(
                        envelope_validator,
                        sidecar.envelope.raw,
                        entry.slug,
                        sidecar.id,
                        str(sidecar.envelope.path),
                    )
                )

    return findings


def _validate(
    validator: schema_engine.Draft202012Validator,
    instance: Mapping[str, Any],
    category: str,
    case_id: str | None,
    path: str,
) -> list[Finding]:
    findings: list[Finding] = []
    for error in validator.iter_errors(instance):
        # The message names the failing KEYWORD and the JSON pointer, never the failing value: a
        # value is case content, and a finding is content-free (plan §8 Q6 item 15).
        pointer = "/".join(str(part) for part in error.path) or "<root>"
        findings.append(
            Finding(_ID, "FAIL", category, case_id, f"schema keyword {error.validator!r} failed at {pointer}", path)
        )
    return findings


def _beyond_schema(
    raw: Mapping[str, Any],
    category: str,
    case_id: str,
    path: str,
    statuses: set[str],
    status_source: str | None,
) -> list[Finding]:
    findings: list[Finding] = []

    legal_as_at = raw.get("legal_as_at")
    if isinstance(legal_as_at, str) and not is_real_calendar_date(legal_as_at):
        findings.append(
            Finding(_ID, "FAIL", category, case_id, "legal_as_at is not a real calendar date", path)
        )

    if status_source is not None:
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                category,
                case_id,
                "ANSWER_STATUS_VOCABULARY_UNRESOLVED: the packages/contracts enum export could not "
                f"be read ({status_source}); owner FND-03",
                path,
            )
        )
    else:
        expected = raw.get("expected_answer_status")
        if isinstance(expected, str) and expected not in statuses:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    category,
                    case_id,
                    "expected_answer_status is not a member of the canonical AnswerStatus family",
                    path,
                )
            )
        acceptable = raw.get("acceptable_statuses")
        if isinstance(acceptable, list):
            outside = sum(1 for value in acceptable if value not in statuses)
            if outside:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        category,
                        case_id,
                        f"{outside} acceptable_statuses member(s) are not in the canonical "
                        "AnswerStatus family",
                        path,
                    )
                )

    findings.extend(_jurisdiction_shape(raw, category, case_id, path))
    return findings


def _jurisdiction_shape(
    raw: Mapping[str, Any], category: str, case_id: str, path: str
) -> list[Finding]:
    """Shape only — and say so, loudly, every time.

    A silent shape-only check would read as a passing membership check to the next contributor.
    """
    findings: list[Finding] = []
    values = raw.get("jurisdictions")
    if not isinstance(values, list):
        return findings
    malformed = sum(
        1 for value in values if not isinstance(value, str) or not contract_enums.JURISDICTION_SHAPE.match(value)
    )
    if malformed:
        findings.append(
            Finding(_ID, "FAIL", category, case_id, f"{malformed} jurisdiction token(s) are malformed", path)
        )
    if values:
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                category,
                case_id,
                f"JURISDICTION_VOCABULARY_UNRESOLVED: {contract_enums.JURISDICTION_FAMILY_ABSENT}",
                path,
            )
        )
    return findings
