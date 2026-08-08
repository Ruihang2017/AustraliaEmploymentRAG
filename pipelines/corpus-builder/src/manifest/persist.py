"""Write the `corpus_release` row CRPS-01's DDL defines (CRPS-02 deliverable 11).

PRD §35.3 makes a release *"immutable after signing"*, and CRPS-01 backs that with
`corpus_release_no_update` / `corpus_release_no_delete` triggers that fire `WHEN OLD.signature IS
NOT NULL`. The checks below exist so the common mistakes fail with a READABLE error naming the
release and the rule, BEFORE the trigger or the primary key produces an opaque SQLite message. They
are not the guarantee — the triggers and the read-only production open are.
"""

from __future__ import annotations

import sqlite3
from typing import Mapping

from .canonical import canonical_value
from .model import ReleaseManifest, ReleaseRowExists, UnsignedRelease

__all__ = ["RELEASE_KIND_TO_STATUS", "insert_release_row"]

#: `corpus_release.status` HAS NO ENUM CHECK YET. `schema/corpus/002_enums.map.json` lists it as a
#: PENDING family under gap Q-CRPS-4 / FND-03, so there is no canonical vocabulary to consume and
#: the ticket's fixed two-argument signature leaves nowhere to pass one explicitly. This mapping is
#: therefore a deliberate, single, named placeholder, and
#: `tests/manifest/test_release_status_vocabulary.py` is its drift guard: the day FND-03 publishes a
#: CorpusReleaseStatus family, that test fails until every value below is a member of it (or the
#: mapping is deleted in favour of the published vocabulary).
RELEASE_KIND_TO_STATUS: Mapping[str, str] = {
    "CANDIDATE": "CANDIDATE",
    "PUBLISHED": "PUBLISHED",
    "SYNTHETIC_FIXTURE": "SYNTHETIC_FIXTURE",
}


def insert_release_row(connection: sqlite3.Connection, manifest: ReleaseManifest) -> None:
    """Insert the `corpus_release` row for *manifest*.

    Column mapping worth stating, because it is not one-to-one with the manifest:

    * `status` <- `RELEASE_KIND_TO_STATUS[release_kind]` (see the constant's note).
    * `schema_version` <- `versions.schema`, `parser_version` <- `versions.parser`.
    * `embedding_profile` <- `embedding_profile.profile_id` ONLY: the column is a text key that
      joins to `chunk_embedding.profile_id`, and the full profile object stays in the manifest.
    * `signature` <- the canonical JSON of the signature object, so the algorithm, signer identity
      and signing time survive in the database and the immutability triggers (which key on
      `signature IS NOT NULL`) arm themselves.
    * `counts_json` / `coverage_json` / `evaluation_json` <- canonical JSON of those members.
    """
    if manifest.signature is None and manifest.release_kind != "CANDIDATE":
        raise UnsignedRelease(
            f"release {manifest.release_id} is a {manifest.release_kind} with no signature; only a "
            "CANDIDATE may be recorded unsigned (PRD §18.4: production verifies the signature)"
        )

    existing = connection.execute(
        "SELECT id, signature FROM corpus_release WHERE id = ?", (manifest.release_id,)
    ).fetchone()
    if existing is not None:
        state = "signed" if existing[1] is not None else "unsigned"
        raise ReleaseRowExists(
            f"corpus_release already holds a {state} row for {manifest.release_id!r}; PRD §35.3 "
            "makes a release immutable after signing, so a change is a NEW release id, never an "
            "update to this one"
        )

    connection.execute(
        "INSERT INTO corpus_release"
        " (id, parent_id, status, created_at, manifest_sha256, signature, schema_version,"
        "  parser_version, embedding_profile, counts_json, coverage_json, evaluation_json)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            manifest.release_id,
            manifest.parent_release_id,
            _status_of(manifest.release_kind),
            manifest.created_at,
            manifest.manifest_sha256,
            None if manifest.signature is None else canonical_value(manifest.signature.to_dict()),
            manifest.versions.schema,
            manifest.versions.parser,
            manifest.embedding_profile.profile_id,
            canonical_value(manifest.counts.to_dict()),
            canonical_value([entry.to_dict() for entry in manifest.coverage]),
            canonical_value(manifest.evaluation.to_dict()),
        ),
    )


def _status_of(release_kind: str) -> str:
    try:
        return RELEASE_KIND_TO_STATUS[release_kind]
    except KeyError:
        raise ValueError(f"no corpus_release.status is mapped for release_kind {release_kind!r}") from None
