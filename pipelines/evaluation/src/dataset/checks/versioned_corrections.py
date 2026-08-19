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

BLIND CASES ARE CHECKED BY THE SAME THREE STEPS, and that is the whole point of the check. A BLIND
case is exactly where an invisible edit is cheapest — nobody can read the diff — so exempting it
would leave PRD §43.4 enforced only where it was never at risk. Each blind case is checked twice,
against two different identities, because neither alone is sufficient:

* its SIDECAR metadata (`BlindSidecar.content_sha256`, which deliberately excludes
  `envelope_digest`) — this catches a hand edit to a blind case's split, category, trap types or
  jurisdictions;
* its sealed PLAINTEXT (`blind_content_sha256`, the keyed salted digest `seal` writes into the
  envelope and `version new` copies into the registry) — this catches a re-seal of CORRECTED
  content, which is the invisible edit that matters. It is deliberately NOT the ciphertext digest:
  a re-seal of identical plaintext changes the ciphertext, so an envelope digest would raise a
  false alarm on a re-seal and stay silent about nothing.

When the registry carries no plaintext digest for a blind case — an envelope sealed before the salt
existed, or by a path that skipped it — the check reports UNRESOLVED. That is not a pass (sub-PRD
D11): "this case's content cannot be shown to be unchanged" must never render as "unchanged".

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

        for sidecar in entry.sidecars:
            findings.extend(
                _blind_case(dataset, entry.slug, sidecar, latest, latest_rows, migrated)
            )
    return findings


def _blind_case(dataset, slug, sidecar, latest, latest_rows, migrated) -> list[Finding]:
    """The three steps above, for a case whose content exists only as ciphertext.

    Everything here is computable WITHOUT the private key: the sidecar is plaintext metadata, and
    the plaintext digest is a value `seal` recorded at sealing time. No branch of this function can
    reach blind content, and no message it builds carries anything but ids and version names.
    """
    findings: list[Finding] = []
    path = str(sidecar.path)
    row = latest_rows.get(sidecar.id)
    if row is None:
        return [
            Finding(
                _ID,
                "FAIL",
                slug,
                sidecar.id,
                f"the BLIND case is not registered in {latest.version}; a sealed case is registered "
                "like any other, or its content could be replaced with nothing to compare against",
                path,
            )
        ]

    if row.get("content_sha256") != sidecar.content_sha256():
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                sidecar.id,
                f"BLIND sidecar metadata differs from the {latest.version} registry with no new "
                "dataset_version; PRD §14.3 forbids an invisible edit",
                path,
            )
        )

    current_content = sidecar.envelope.blind_content_sha256 if sidecar.envelope is not None else ""
    registered_content = row.get("blind_content_sha256")
    if not current_content or not isinstance(registered_content, str) or not registered_content:
        # Honest degradation, never a pass: with no plaintext digest on both sides there is no way
        # to tell a re-seal of the same content from a re-seal of corrected content.
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                slug,
                sidecar.id,
                "BLIND_CONTENT_IDENTITY_UNRECORDED: the sealed plaintext carries no keyed content "
                f"digest in the envelope or in {latest.version}, so a correction to it cannot be "
                "detected; re-seal through `dataset seal` against a registry with a "
                "content_hash_salt",
                path,
            )
        )
        return findings

    if current_content != registered_content:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                sidecar.id,
                f"the sealed plaintext differs from the {latest.version} registry with no new "
                "dataset_version; a corrected BLIND case is a new version with a reason "
                "(PRD §14.3, §43.4)",
                path,
            )
        )
        return findings

    previous = _previous(dataset.versions, latest, sidecar.id)
    if previous is None:
        return findings
    previous_row = previous.rows()[sidecar.id]
    previous_content = previous_row.get("blind_content_sha256")
    if not isinstance(previous_content, str) or not previous_content:
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                slug,
                sidecar.id,
                f"BLIND_CONTENT_IDENTITY_UNRECORDED: {previous.version} recorded no keyed content "
                "digest for this case, so whether it was corrected since cannot be established",
                path,
            )
        )
        return findings
    if previous_content == registered_content:
        return findings

    # The sealed content moved between two versions: a correction. It needs the same evidence a
    # visible correction needs — a reason on the case, and a migration record linking old gold to
    # new. The sidecar allowlist carries `change_reason` precisely so this is possible.
    if not sidecar.raw.get("change_reason"):
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                sidecar.id,
                "a corrected BLIND case needs a non-empty change_reason in its sidecar (PRD §14.3)",
                path,
            )
        )
    if sidecar.id not in migrated.get((previous.version, latest.version), set()):
        # Unlike a visible case, nothing here can tell whether the EXPECTED OUTPUT moved or only the
        # question did: that distinction lives in the plaintext. "Cannot be shown unchanged" must
        # not read as "unchanged", so every blind correction requires the migration record.
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                sidecar.id,
                f"the sealed content changed between {previous.version} and {latest.version} with "
                "no migration record; a BLIND correction cannot be shown to have left expected "
                "output alone, so the record is always required (PRD §43.2, §43.4)",
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
