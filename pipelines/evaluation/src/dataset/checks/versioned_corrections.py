"""`VERSIONED_CORRECTIONS` — a correction is a new version with a reason, never an invisible edit.

PRD §14.3: "Formal dataset corrections create a new version and reason; they are not edited
invisibly." PRD §43.4: "Agents may not 'fix' a failing gold case by changing expected output without
a versioned founder-approved reason."

The rule, in three steps:

1. every case's content hash must equal the row registered for it in the version its
   `dataset_version` names — a case whose content moved without a new version is an invisible edit;
2. a case in a version LATER than the one that registered it must carry a non-empty `change_reason`
   and an `approved_by`;
3. if its EXPECTED OUTPUT moved (the eight members `model.EXPECTED_OUTPUT_FIELDS` names), a
   migration record from the old version to the new one must also list the case. PRD §43.2's "past
   reports stay reproducible" is exactly what that migration preserves.

Hashes are over CANONICAL JSON, never file bytes — `core.autocrlf` makes bytes differ between
checkouts while data does not, and a registry that failed on a checkout would say nothing about a
correction. See `model.py`'s header.
"""

from __future__ import annotations

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories

_ID = "VERSIONED_CORRECTIONS"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    registries = {version.version: version for version in dataset.versions}
    if not registries:
        return findings

    migrated: dict[tuple[str, str], set[str]] = {}
    for migration in dataset.migrations:
        migrated.setdefault((migration.from_version, migration.to_version), set()).update(
            migration.case_ids()
        )

    for entry in categories(dataset, context.category):
        for case in entry.cases:
            declared = case.raw.get("dataset_version")
            if not isinstance(declared, str):
                continue
            registered_in, row = _registration(registries, case.id)
            if row is None:
                # Not yet registered anywhere: `version new` has not been run for it. That is a
                # FAIL, because an unregistered case has no baseline to be corrected against.
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        "the case is in no dataset-version registry; run `version new` rather than "
                        "editing content in place",
                        str(case.path),
                    )
                )
                continue

            if registered_in == declared:
                if row.get("content_sha256") != case.content_sha256():
                    findings.append(
                        Finding(
                            _ID,
                            "FAIL",
                            entry.slug,
                            case.id,
                            f"content differs from the {declared} registry with no new "
                            "dataset_version; PRD §14.3 forbids an invisible edit",
                            str(case.path),
                        )
                    )
                continue

            if not case.raw.get("change_reason"):
                findings.append(
                    Finding(_ID, "FAIL", entry.slug, case.id, "a corrected case needs a change_reason", str(case.path))
                )
            if not case.raw.get("approved_by"):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        "a corrected case needs approved_by (PRD §43.4 founder approval)",
                        str(case.path),
                    )
                )
            if row.get("expected_output_sha256") not in (None, case.expected_output_sha256()):
                if case.id not in migrated.get((registered_in, declared), set()):
                    findings.append(
                        Finding(
                            _ID,
                            "FAIL",
                            entry.slug,
                            case.id,
                            f"expected output changed between {registered_in} and {declared} with no "
                            "migration record; PRD §43.2 requires old/new gold to be linked so past "
                            "reports stay reproducible",
                            str(case.path),
                        )
                    )
    return findings


def _registration(registries, case_id: str):
    """The LATEST version that registered *case_id*, and its row."""
    best_version, best_row = None, None
    for version, registry in registries.items():
        row = registry.rows().get(case_id)
        if row is None:
            continue
        if best_version is None or int(version.lstrip("v")) > int(best_version.lstrip("v")):
            best_version, best_row = version, row
    return best_version, best_row
