"""`VERSIONED_CORRECTIONS` — a correction is a new version with a reason, never an invisible edit.

PRD §14.3: "Formal dataset corrections create a new version and reason; they are not edited
invisibly." PRD §43.4: "Agents may not 'fix' a failing gold case by changing expected output without
a versioned founder-approved reason."

THE RULE, in three steps, against the LATEST dataset-version registry:

1. every case must be registered there, and its current content hash must equal the registered one.
   A case whose content moved without a new version being cut is exactly the invisible edit PRD
   §14.3 forbids — and the repair is `version new`, not an edit to the registry;
2. if an EARLIER registry recorded a different hash for that case, a correction has happened. The
   case must carry a non-empty `change_reason`, and the registry itself carries the founder approval
   (`approved_by`, `reason` — both required by `dataset-version.schema.json`, so the approval cannot
   be omitted);
3. if the correction moved the case's EXPECTED OUTPUT (the eight members
   `model.EXPECTED_OUTPUT_FIELDS` names), a migration record from the earlier version to the latest
   must also list the case. PRD §43.2's "past reports stay reproducible" is precisely what that
   migration preserves, which is why an expected-output change needs more than a version bump.

Hashes are over CANONICAL JSON, never file bytes — `core.autocrlf` makes bytes differ between
checkouts while data does not, and a registry that failed on a checkout would say nothing about a
correction. See `model.py`'s header.
"""

from __future__ import annotations

from typing import Any, Mapping

from ..findings import Finding
from ..model import Dataset, DatasetVersion
from . import CheckContext
from ._common import categories

_ID = "VERSIONED_CORRECTIONS"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    latest = dataset.latest_version()
    if latest is None:
        return findings

    latest_rows = latest.rows()
    migrated: dict[tuple[str, str], set[str]] = {}
    for migration in dataset.migrations:
        migrated.setdefault((migration.from_version, migration.to_version), set()).update(
            migration.case_ids()
        )

    for entry in categories(dataset, context.category):
        for case in entry.cases:
            path = str(case.path)
            row = latest_rows.get(case.id)
            if row is None:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        f"the case is not registered in {latest.version}; run `version new` rather "
                        "than editing content in place",
                        path,
                    )
                )
                continue
            if row.get("content_sha256") != case.content_sha256():
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        f"content differs from the {latest.version} registry with no new "
                        "dataset_version; PRD §14.3 forbids an invisible edit",
                        path,
                    )
                )
                continue

            previous = _previous(dataset.versions, latest, case.id)
            if previous is None:
                continue
            previous_row = previous.rows()[case.id]
            if previous_row.get("content_sha256") == row.get("content_sha256"):
                continue

            if not case.raw.get("change_reason"):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        "a corrected case needs a non-empty change_reason (PRD §14.3)",
                        path,
                    )
                )
            if _expected_output_moved(previous_row, row) and case.id not in migrated.get(
                (previous.version, latest.version), set()
            ):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        f"expected output changed between {previous.version} and {latest.version} "
                        "with no migration record; PRD §43.2 requires old/new gold to be linked so "
                        "past reports stay reproducible",
                        path,
                    )
                )
    return findings


def _expected_output_moved(previous: Mapping[str, Any], current: Mapping[str, Any]) -> bool:
    before, after = previous.get("expected_output_sha256"), current.get("expected_output_sha256")
    if before is None or after is None:
        # An unhashed expected output cannot be shown to be unchanged, and "cannot be shown
        # unchanged" must not read as "unchanged".
        return True
    return before != after


def _previous(
    versions: tuple[DatasetVersion, ...], latest: DatasetVersion, case_id: str
) -> DatasetVersion | None:
    """The highest version below *latest* that registered *case_id*."""
    ceiling = _number(latest.version)
    best: DatasetVersion | None = None
    for version in versions:
        if _number(version.version) >= ceiling or case_id not in version.rows():
            continue
        if best is None or _number(version.version) > _number(best.version):
            best = version
    return best


def _number(version: str) -> int:
    try:
        return int(version.lstrip("v"))
    except ValueError:  # pragma: no cover — the schema's pattern forbids it
        return -1
