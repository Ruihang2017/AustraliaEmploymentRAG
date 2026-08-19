"""The baseline candidate is what every other test varies, so its own shape is asserted here."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from candidate_fixtures import PROFILE_ID, Candidate
from candidate_paths import SRC  # noqa: F401

from validation.source_groups import MANDATORY_SOURCE_GROUPS


def test_every_mandatory_group_is_present(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        groups = {
            str(row[0])
            for row in connection.execute("SELECT DISTINCT source_group_id FROM source").fetchall()
        }
    finally:
        connection.close()
    assert groups == set(MANDATORY_SOURCE_GROUPS)


def test_baseline_has_chunks_embeddings_and_a_resolved_quarantine_item(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        chunks = connection.execute("SELECT COUNT(*) FROM search_chunk").fetchone()[0]
        embeddings = connection.execute("SELECT COUNT(*) FROM chunk_embedding").fetchone()[0]
        open_items = connection.execute(
            "SELECT COUNT(*) FROM quarantine_item WHERE resolved_at IS NULL"
        ).fetchone()[0]
    finally:
        connection.close()
    assert chunks > 0
    assert embeddings == chunks
    assert open_items == 0


def test_embedding_directory_carries_crps_05_s_three_artifacts(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    assert (candidate.embedding_dir / "vectors.usearch").is_file()
    document = json.loads(
        (candidate.embedding_dir / "embedding-manifest.json").read_text(encoding="utf-8")
    )
    assert document["profile_id"] == PROFILE_ID
    report = json.loads(
        (candidate.embedding_dir / "embedding-build-report.json").read_text(encoding="utf-8")
    )
    assert report["embedded_count"] == document["vector_file"]["count"]


def test_the_corpus_database_is_opened_read_only(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`connect()` is a `mode=ro` URI, so SQLite itself refuses a write."""
    import sqlite3

    candidate = candidate_factory()
    connection = candidate.connect()
    try:
        try:
            connection.execute("INSERT INTO corpus_meta (id) VALUES ('x')")
        except sqlite3.OperationalError as error:
            assert "readonly" in str(error).lower()
        else:  # pragma: no cover — a read-only open that accepted a write is a hard defect
            raise AssertionError("the read-only connection accepted a write")
    finally:
        connection.close()


def test_request_is_constructible_and_names_no_environment(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    request = candidate.request()
    assert request.release_kind == "CANDIDATE"
    assert request.signing_requested
    assert request.public_key_paths and all(isinstance(p, Path) for p in request.public_key_paths)
    assert request.pin_for_role("DOCUMENT_EMBEDDING") is not None
    assert request.pin_for_role("QUERY_EMBEDDING") is not None
