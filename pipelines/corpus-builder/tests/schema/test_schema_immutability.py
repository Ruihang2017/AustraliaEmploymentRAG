"""PRD §35.8 invariant 5 (no UPDATE/DELETE path) and PRD §15.3 (chunks are rebuildable)."""

from __future__ import annotations

import sqlite3

import pytest

from corpus_seed import HASH, TS, seed_corpus

#: table -> a row id the seed created, and a column that is safe to try to update.
IMMUTABLE = {
    "source_artifact": ("art_1", "content_type"),
    "licence_snapshot": ("lsnap_1", "terms_url"),
    "document_version": ("dv_1", "official_url"),
    "document_node": ("node_1", "node_kind"),
    "node_version": ("nv_1", "heading"),
    "node_relation": ("nrel_1", "derivation"),
    "legal_event": ("evt_1", "metadata_json"),
}


@pytest.mark.parametrize("table", sorted(IMMUTABLE))
def test_update_on_an_immutable_table_raises(conn: sqlite3.Connection, table: str) -> None:
    seed_corpus(conn)
    row_id, column = IMMUTABLE[table]
    with pytest.raises(sqlite3.IntegrityError) as caught:
        conn.execute(f"UPDATE {table} SET {column} = 'changed' WHERE id = ?", (row_id,))
    assert f"{table} is immutable" in str(caught.value)


@pytest.mark.parametrize("table", sorted(IMMUTABLE))
def test_delete_on_an_immutable_table_raises(conn: sqlite3.Connection, table: str) -> None:
    seed_corpus(conn)
    row_id, _ = IMMUTABLE[table]
    with pytest.raises(sqlite3.IntegrityError) as caught:
        conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
    assert f"{table} is immutable" in str(caught.value)


@pytest.mark.parametrize("statement", ["INSERT OR REPLACE INTO", "REPLACE INTO"])
def test_insert_or_replace_cannot_bypass_the_delete_trigger(
    conn: sqlite3.Connection, statement: str
) -> None:
    """SECURITY. With SQLite's DEFAULT `PRAGMA recursive_triggers = 0` this bypass is real:
    the conflicting row is deleted WITHOUT firing the BEFORE DELETE trigger. Every connection
    `contracts.schema` hands out therefore sets `recursive_triggers = ON`.
    """
    seed_corpus(conn)
    assert conn.execute("PRAGMA recursive_triggers").fetchone()[0] == 1
    with pytest.raises(sqlite3.IntegrityError) as caught:
        conn.execute(
            f"{statement} node_version (id, document_version_id, document_node_id,"
            " canonical_text, ordinal, effective_from, text_hash, created_at)"
            " VALUES ('nv_1', 'dv_1', 'node_1', 'replaced', 0, '2026-07-01', ?, ?)",
            (HASH, TS),
        )
    assert "node_version is immutable" in str(caught.value)
    assert conn.execute("SELECT canonical_text FROM node_version WHERE id = 'nv_1'").fetchone() == (
        "In this Act...",
    )


@pytest.mark.parametrize("table", ["search_chunk", "chunk_embedding"])
def test_rebuildable_tables_accept_update_and_delete(conn: sqlite3.Connection, table: str) -> None:
    """PRD §15.3: *"SearchChunks and embeddings may be deleted/rebuilt."*"""
    seed_corpus(conn)
    column = "index_tier" if table == "search_chunk" else "vector_key"
    value = "TIER_3_METADATA_AND_ON_DEMAND" if table == "search_chunk" else "vec/2"
    conn.execute(f"UPDATE {table} SET {column} = ?", (value,))
    conn.execute("DELETE FROM chunk_embedding")
    if table == "search_chunk":
        conn.execute("DELETE FROM search_chunk")
        assert conn.execute("SELECT count(*) FROM search_chunk").fetchone() == (0,)


def _insert_release(conn: sqlite3.Connection, release_id: str, signature: str | None) -> None:
    conn.execute(
        "INSERT INTO corpus_release (id, parent_id, status, created_at, manifest_sha256,"
        " signature, schema_version, parser_version, embedding_profile) VALUES (?, NULL, 'DRAFT',"
        " ?, ?, ?, '1.0.0', '1.0.0', 'profile-a')",
        (release_id, TS, HASH, signature),
    )


def test_unsigned_corpus_release_is_mutable_and_can_be_signed(conn: sqlite3.Connection) -> None:
    _insert_release(conn, "cr_1", None)
    conn.execute("UPDATE corpus_release SET status = 'BUILDING' WHERE id = 'cr_1'")
    # The signing UPDATE itself must succeed: the guard reads OLD.signature, still NULL here.
    conn.execute("UPDATE corpus_release SET signature = 'sig' WHERE id = 'cr_1'")
    assert conn.execute("SELECT signature FROM corpus_release WHERE id = 'cr_1'").fetchone() == ("sig",)
    _insert_release(conn, "cr_2", None)
    conn.execute("DELETE FROM corpus_release WHERE id = 'cr_2'")


def test_signed_corpus_release_is_immutable(conn: sqlite3.Connection) -> None:
    _insert_release(conn, "cr_3", "signature-bytes")
    with pytest.raises(sqlite3.IntegrityError) as update_error:
        conn.execute("UPDATE corpus_release SET status = 'PROMOTED' WHERE id = 'cr_3'")
    assert "corpus_release is immutable" in str(update_error.value)
    with pytest.raises(sqlite3.IntegrityError) as delete_error:
        conn.execute("DELETE FROM corpus_release WHERE id = 'cr_3'")
    assert "corpus_release is immutable" in str(delete_error.value)


def test_signature_itself_cannot_be_replaced_once_set(conn: sqlite3.Connection) -> None:
    _insert_release(conn, "cr_4", "signature-bytes")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE corpus_release SET signature = 'other' WHERE id = 'cr_4'")
