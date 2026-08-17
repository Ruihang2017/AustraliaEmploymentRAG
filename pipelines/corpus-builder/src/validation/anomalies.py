"""The PRD §40.9 flag-rather-fail anomaly rules (CRPS-06 deliverable 6).

PRD §40.9: *"Initial anomaly rules flag, rather than automatically fail, a ±10% collection count
change, >2% parse failure, any duplicate stable identity, any overlapping effect interval for a
supposedly consolidated series, any missing mandatory source group, or any broken gold citation.
Critical identity/time/citation and mandatory-source failures block release; percentage thresholds
are refined per source after baseline measurement."*

Read carefully, that sentence names SIX rules of two different kinds, and this module keeps them
apart by construction:

* TWO PERCENTAGE rules — count change and parse-failure rate — which flag (`ANOMALY`) and are
  overridable per source group. Both constants below are **initial defaults**: breakdown plan §8
  **Q9** is baseline-selected, each adapter may tighten or replace its own percentages once it has a
  representative baseline, and `GOLD-16` consolidates and verifies the final per-source values.
* FOUR BLOCKING CLASSES — duplicate stable identity, overlapping consolidated effect interval,
  missing mandatory source group, broken gold citation. They block **unconditionally**, and they are
  IMPLEMENTED BY THE GATES THAT OWN THEM (identity, time, completeness, citation) so that there is
  exactly one implementation of each. `BLOCKING_CLASSES` below names them for the record and for the
  report; it is a module-level constant that no request-supplied mapping can reach.

THE OVERRIDE CAN NEVER DOWNGRADE A BLOCKING CLASS, and that is a structural property rather than a
promise: `AnomalyThresholds` carries only two floats and a mapping of the same two floats per source
group, `__post_init__` accepts fractions in `(0, 1]` only, and no code path anywhere reads a
threshold when deciding one of the four classes. `tests/validation/test_anomalies.py` supplies a
hostile override naming each of the four and asserts each stays BLOCKING.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Final, Mapping

from .findings import Finding

__all__ = [
    "BLOCKING_CLASSES",
    "COLLECTION_COUNT_CHANGE_FRACTION",
    "PARSE_FAILURE_RATE",
    "AnomalyThresholds",
    "collection_count_anomalies",
    "parse_failure_anomalies",
]

#: PRD §40.9's "±10% collection count change". INITIAL DEFAULT — breakdown plan §8 Q9 is
#: baseline-selected; an adapter may tighten or replace it per source group after a representative
#: baseline, and `GOLD-16` consolidates the final per-source values.
COLLECTION_COUNT_CHANGE_FRACTION: Final[float] = 0.10

#: PRD §40.9's ">2% parse failure". INITIAL DEFAULT, on the same Q9 basis as the constant above.
PARSE_FAILURE_RATE: Final[float] = 0.02

#: The four unconditional BLOCKING classes, and the gate that implements each. Named here for the
#: record; NOT dispatched from here, so no threshold, configuration value or per-source setting can
#: reach them.
BLOCKING_CLASSES: Final[Mapping[str, str]] = {
    "DUPLICATE_STABLE_IDENTITY": "identity",
    "OVERLAPPING_CONSOLIDATED_EFFECT_INTERVAL": "time",
    "MISSING_MANDATORY_SOURCE_GROUP": "completeness",
    "BROKEN_GOLD_CITATION": "citation",
}


def _check_fraction(name: str, value: float) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{name} must be a number, got {value!r}")
    if not 0 < float(value) <= 1:
        raise ValueError(
            f"{name} is a FRACTION in (0, 1] — 0.10 means ten per cent — and was {value!r}"
        )


@dataclass(frozen=True)
class AnomalyThresholds:
    """The two percentage rules, with per-source-group overrides.

    There is deliberately no member, key or code path by which an override can name one of the four
    `BLOCKING_CLASSES`: the type carries floats and nothing else.
    """

    collection_count_change_fraction: float = COLLECTION_COUNT_CHANGE_FRACTION
    parse_failure_rate: float = PARSE_FAILURE_RATE
    by_source_group: Mapping[str, Mapping[str, float]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        _check_fraction("collection_count_change_fraction", self.collection_count_change_fraction)
        _check_fraction("parse_failure_rate", self.parse_failure_rate)
        cleaned: dict[str, dict[str, float]] = {}
        for group, overrides in dict(self.by_source_group).items():
            if not isinstance(overrides, Mapping):
                raise ValueError(f"the override for source group {group!r} must be a mapping")
            entry: dict[str, float] = {}
            for key, value in overrides.items():
                if key not in ("collection_count_change_fraction", "parse_failure_rate"):
                    raise ValueError(
                        f"{key!r} is not an overridable threshold for source group {group!r}. Only "
                        "the two PRD §40.9 PERCENTAGES are overridable; the four unconditional "
                        f"BLOCKING classes {tuple(BLOCKING_CLASSES)!r} are not overridable by any "
                        "threshold, configuration or per-source setting"
                    )
                _check_fraction(f"{group}.{key}", value)
                entry[key] = float(value)
            cleaned[group] = entry
        object.__setattr__(self, "by_source_group", cleaned)

    def for_group(self, source_group_id: str) -> tuple[float, float]:
        """`(count change fraction, parse failure rate)` for *source_group_id*."""
        overrides = self.by_source_group.get(source_group_id, {})
        return (
            float(overrides.get(
                "collection_count_change_fraction", self.collection_count_change_fraction
            )),
            float(overrides.get("parse_failure_rate", self.parse_failure_rate)),
        )


# ==================================================================================================
# The two percentage rules
# ==================================================================================================


def _documents_by_group(connection: sqlite3.Connection) -> dict[str, int]:
    rows = connection.execute(
        "SELECT s.source_group_id, COUNT(d.id)"
        " FROM source s LEFT JOIN legal_document d ON d.source_id = s.id"
        " GROUP BY s.source_group_id"
    ).fetchall()
    return {str(group): int(count) for group, count in rows}


def collection_count_anomalies(
    candidate: sqlite3.Connection,
    parent: sqlite3.Connection | None,
    thresholds: AnomalyThresholds,
) -> list[Finding]:
    """PRD §40.9's ±threshold collection count change, per source group.

    With no parent this is NOT MEASURABLE, and it says so with an INFO finding rather than passing
    silently — "no comparison was possible" and "the comparison passed" must never look the same.
    """
    if parent is None:
        return [
            Finding(
                gate="completeness",
                code="ANOMALY_NO_PARENT",
                severity="INFO",
                message=(
                    "no parent release database was supplied, so the PRD §40.9 collection-count "
                    "change rule could not be measured for any source group"
                ),
                subject="anomalies.collection_count_change",
            )
        ]
    before = _documents_by_group(parent)
    after = _documents_by_group(candidate)
    findings: list[Finding] = []
    for group in sorted(set(before) | set(after)):
        previous = before.get(group, 0)
        current = after.get(group, 0)
        fraction, _ = thresholds.for_group(group)
        if previous == 0:
            if current == 0:
                continue
            findings.append(
                Finding(
                    gate="completeness",
                    code="ANOMALY_NOT_MEASURABLE",
                    severity="INFO",
                    message=(
                        f"source group {group} had no documents in the parent release, so a "
                        "percentage change is not measurable; it now has "
                        f"{current}"
                    ),
                    subject=f"source_group[{group}]",
                    evidence={"parent_count": previous, "candidate_count": current},
                )
            )
            continue
        change = (current - previous) / previous
        if abs(change) > fraction:
            findings.append(
                Finding(
                    gate="completeness",
                    code="ANOMALY_COLLECTION_COUNT_CHANGE",
                    severity="ANOMALY",
                    message=(
                        f"source group {group}'s document count moved from {previous} to {current} "
                        f"({change:+.1%}), beyond the ±{fraction:.0%} PRD §40.9 rule. This FLAGS "
                        "the release; it does not fail it"
                    ),
                    subject=f"source_group[{group}]",
                    evidence={
                        "parent_count": previous,
                        "candidate_count": current,
                        "change_fraction": round(change, 6),
                        "threshold_fraction": fraction,
                    },
                )
            )
    return findings


def parse_failure_anomalies(
    candidate: sqlite3.Connection, thresholds: AnomalyThresholds
) -> list[Finding]:
    """PRD §40.9's >threshold parse-failure rate, per source group, from `ingestion_run`.

    A zero denominator (nothing fetched) is reported INFO "not measurable" and is never a pass.
    """
    rows = candidate.execute(
        "SELECT s.source_group_id, SUM(r.fetched_count), SUM(r.parsed_count)"
        " FROM ingestion_run r JOIN source s ON s.id = r.source_id"
        " GROUP BY s.source_group_id"
    ).fetchall()
    findings: list[Finding] = []
    for group, fetched, parsed in sorted(rows, key=lambda row: str(row[0])):
        group = str(group)
        fetched = int(fetched or 0)
        parsed = int(parsed or 0)
        _, rate = thresholds.for_group(group)
        if fetched == 0:
            findings.append(
                Finding(
                    gate="completeness",
                    code="ANOMALY_NOT_MEASURABLE",
                    severity="INFO",
                    message=(
                        f"source group {group} recorded no fetched artifacts, so its parse-failure "
                        "rate is not measurable; this is not a pass"
                    ),
                    subject=f"source_group[{group}]",
                    evidence={"fetched_count": fetched, "parsed_count": parsed},
                )
            )
            continue
        failed = max(fetched - parsed, 0)
        observed = failed / fetched
        if observed > rate:
            findings.append(
                Finding(
                    gate="completeness",
                    code="ANOMALY_PARSE_FAILURE_RATE",
                    severity="ANOMALY",
                    message=(
                        f"source group {group} failed to parse {failed} of {fetched} fetched "
                        f"artifacts ({observed:.1%}), above the {rate:.0%} PRD §40.9 rule. This "
                        "FLAGS the release; it does not fail it"
                    ),
                    subject=f"source_group[{group}]",
                    evidence={
                        "fetched_count": fetched,
                        "parsed_count": parsed,
                        "observed_rate": round(observed, 6),
                        "threshold_rate": rate,
                    },
                )
            )
    return findings
