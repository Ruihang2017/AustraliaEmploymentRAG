"""Acceptance: `insert_release_row()` cannot update a signed row, and refuses an unsigned non-CANDIDATE.

PRD §35.3: `corpus_release` is *"immutable after signing"*. CRPS-01's triggers are the guarantee;
the checks here exist so the common mistakes fail with a readable error FIRST.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from manifest_fixtures import read_manifest

from contracts.schema import open_corpus_database
from manifest import (
    ReleaseManifest,
    ReleaseRowExists,
    UnsignedRelease,
    canonical_value,
    insert_release_row,
)
from manifest.persist import RELEASE_KIND_TO_STATUS


@pytest.fixture
def release_db(bundle_factory):
    """`(connection, bundle)` — a writable handle on the bundle's own corpus database."""
    bundle = bundle_factory()
    handle = open_corpus_database(bundle / "corpus.sqlite", read_only=False)
    try:
        yield handle, bundle
    finally:
        handle.close()


def _manifest(bundle: Path) -> ReleaseManifest:
    return ReleaseManifest.from_dict(read_manifest(bundle))


def test_a_signed_row_is_inserted_with_the_documented_column_mapping(release_db) -> None:
    connection, bundle = release_db
    manifest = _manifest(bundle)
    insert_release_row(connection, manifest)
    row = connection.execute(
        "SELECT id, parent_id, status, created_at, manifest_sha256, signature, schema_version,"
        " parser_version, embedding_profile, counts_json, coverage_json, evaluation_json"
        " FROM corpus_release"
    ).fetchone()
    assert row[0] == manifest.release_id
    assert row[1] is None
    assert row[2] == RELEASE_KIND_TO_STATUS[manifest.release_kind]
    assert row[3] == manifest.created_at
    assert row[4] == manifest.manifest_sha256
    assert json.loads(row[5])["key_id"] == manifest.signature.key_id
    assert row[6] == manifest.versions.schema
    assert row[7] == manifest.versions.parser
    assert row[8] == manifest.embedding_profile.profile_id
    assert row[9] == canonical_value(manifest.counts.to_dict())
    assert json.loads(row[10])[0]["source_group_id"] == manifest.coverage[0].source_group_id
    assert json.loads(row[11])["status"] == manifest.evaluation.status


def test_a_second_insert_for_the_same_id_is_a_readable_error(release_db) -> None:
    connection, bundle = release_db
    manifest = _manifest(bundle)
    insert_release_row(connection, manifest)
    with pytest.raises(ReleaseRowExists) as error:
        insert_release_row(connection, manifest)
    message = str(error.value)
    assert manifest.release_id in message
    assert "immutable after signing" in message


def test_an_update_to_a_signed_row_is_refused_by_the_crps_01_trigger(release_db) -> None:
    connection, bundle = release_db
    manifest = _manifest(bundle)
    insert_release_row(connection, manifest)
    with pytest.raises(sqlite3.IntegrityError):
        connection.execute(
            "UPDATE corpus_release SET status = ? WHERE id = ?", ("PUBLISHED", manifest.release_id)
        )


def test_an_unsigned_non_candidate_is_refused(release_db, bundle_factory) -> None:
    connection, _ = release_db
    manifest = _manifest(bundle_factory(release_kind="PUBLISHED", sign=False))
    with pytest.raises(UnsignedRelease) as error:
        insert_release_row(connection, manifest)
    assert "PUBLISHED" in str(error.value)


def test_an_unsigned_candidate_is_allowed(release_db, bundle_factory) -> None:
    connection, _ = release_db
    manifest = _manifest(bundle_factory(release_kind="CANDIDATE", sign=False))
    insert_release_row(connection, manifest)
    assert connection.execute(
        "SELECT signature FROM corpus_release WHERE id = ?", (manifest.release_id,)
    ).fetchone()[0] is None


def test_the_manifest_sha256_satisfies_the_ddl_check(release_db) -> None:
    """The DDL requires 64 lowercase hex; a canonicalised digest always is, and this proves it."""
    connection, bundle = release_db
    manifest = _manifest(bundle)
    insert_release_row(connection, manifest)
    stored = connection.execute("SELECT manifest_sha256 FROM corpus_release").fetchone()[0]
    assert len(stored) == 64 and stored == stored.lower()


def test_every_release_kind_maps_to_a_status() -> None:
    from manifest import RELEASE_KINDS

    assert set(RELEASE_KIND_TO_STATUS) == set(RELEASE_KINDS)
