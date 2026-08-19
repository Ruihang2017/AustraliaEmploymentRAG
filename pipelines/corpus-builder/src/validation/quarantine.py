"""`assert_no_open_quarantine()` and the quarantine summary (CRPS-06 deliverable 5).

PRD §35.3, `quarantine_item`: *"cannot enter promoted release while open"*. So an open item is
BLOCKING regardless of every other gate passing.

WHAT "OPEN" MEANS HERE, and on what basis. A `quarantine_item` row is **OPEN when `resolved_at IS
NULL`**. This is a STRUCTURAL rule taken from the schema, not a membership test against a status
vocabulary, because `packages/contracts` publishes no `QuarantineItemStatus` family: the column is
declared `pending` in `schema/corpus/002_enums.map.json`, it carries no CHECK, and hand-copying its
values into this repository is expressly forbidden by CRPS-01's Feedback obligation (Q-CRPS-4 /
FND-03). When FND-03 publishes the family, this rule is replaced by a membership test — and that is
a ticket change against CRPS-06, not a refactor anyone may do silently.

`status` and `reason_code` are still CARRIED into the finding's evidence and into the summary's
`by_reason_code`, which assumes no vocabulary: reason codes are free text and are reported as found.

The gate and the manifest share this one query on purpose. `QuarantineSummary` is what
`build_release_manifest()` records, so the manifest's `open_count` and the gate's verdict can never
disagree — two independent queries over the same table are how that drift happens.
"""

from __future__ import annotations

import sqlite3

from manifest import QuarantineSummary

from .findings import Finding

__all__ = ["assert_no_open_quarantine", "quarantine_summary"]


def _open_rows(connection: sqlite3.Connection) -> list[tuple[str, str, str | None]]:
    return [
        (str(row[0]), str(row[1]), None if row[2] is None else str(row[2]))
        for row in connection.execute(
            "SELECT id, reason_code, status FROM quarantine_item"
            " WHERE resolved_at IS NULL ORDER BY id"
        ).fetchall()
    ]


def assert_no_open_quarantine(conn: sqlite3.Connection) -> list[Finding]:
    """One BLOCKING finding per open `quarantine_item` row.

    One finding per row rather than one aggregate finding: an operator has to resolve each item, and
    a single "3 items are open" line makes them go and query the database themselves.
    """
    findings: list[Finding] = []
    for item_id, reason_code, status in _open_rows(conn):
        findings.append(
            Finding(
                gate="completeness",
                code="QUARANTINE_OPEN",
                severity="BLOCKING",
                message=(
                    f"quarantine_item {item_id} is unresolved (resolved_at IS NULL) with reason "
                    f"{reason_code!r}; PRD §35.3 forbids quarantined material entering a promoted "
                    "release while open"
                ),
                subject=f"quarantine_item[{item_id}]",
                evidence={"reason_code": reason_code, "status": status},
            )
        )
    return findings


def quarantine_summary(conn: sqlite3.Connection) -> QuarantineSummary:
    """The manifest's `quarantine` member, over the SAME open/resolved rule the gate applies."""
    open_count = int(
        conn.execute(
            "SELECT COUNT(*) FROM quarantine_item WHERE resolved_at IS NULL"
        ).fetchone()[0]
    )
    resolved_count = int(
        conn.execute(
            "SELECT COUNT(*) FROM quarantine_item WHERE resolved_at IS NOT NULL"
        ).fetchone()[0]
    )
    by_reason_code = {
        str(reason): int(count)
        for reason, count in conn.execute(
            "SELECT reason_code, COUNT(*) FROM quarantine_item GROUP BY reason_code"
            " ORDER BY reason_code"
        ).fetchall()
    }
    return QuarantineSummary(
        open_count=open_count,
        resolved_count=resolved_count,
        by_reason_code=by_reason_code,
    )
