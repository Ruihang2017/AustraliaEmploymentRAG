"""Offsets and `text_hash` are exact for every chunk, including the non-ASCII node.

`SRCH-003` / CRPS-01 deliverable 12: offsets are CHARACTER offsets into the NFC-normalised
`node_version.canonical_text`, half-open `[start, end)`, and `text_hash` is the lowercase hex
SHA-256 of the UTF-8 bytes of that slice. A byte-offset implementation passes every ASCII case and
fails the accented one, which is why the non-ASCII coverage is asserted explicitly rather than
hoped for.
"""

from __future__ import annotations

import sqlite3
import unicodedata

from contracts.validate import sha256_hex


def _chunks(connection: sqlite3.Connection) -> list[tuple[str, int, int, str, str]]:
    return [
        (row[0], int(row[1]), int(row[2]), str(row[3]), str(row[4]))
        for row in connection.execute(
            "SELECT c.id, c.start_offset, c.end_offset, c.text_hash, n.canonical_text"
            " FROM search_chunk AS c JOIN node_version AS n ON n.id = c.node_version_id"
            " ORDER BY c.id"
        ).fetchall()
    ]


def test_the_suite_examines_a_non_empty_set_of_chunks(corpus_connection: sqlite3.Connection) -> None:
    assert len(_chunks(corpus_connection)) > 10


def test_every_chunk_slices_its_node_text_and_reproduces_its_hash(
    corpus_connection: sqlite3.Connection,
) -> None:
    offenders: list[str] = []
    for chunk_id, start, end, text_hash, text in _chunks(corpus_connection):
        if not 0 <= start <= end <= len(text):
            offenders.append(f"{chunk_id}: offsets [{start}, {end}) outside [0, {len(text)}]")
            continue
        if sha256_hex(text[start:end]) != text_hash:
            offenders.append(f"{chunk_id}: text_hash does not match the slice")
    assert offenders == [], offenders


def test_every_node_text_is_already_nfc(corpus_connection: sqlite3.Connection) -> None:
    offenders = [
        row[0]
        for row in corpus_connection.execute(
            "SELECT id, canonical_text FROM node_version"
        ).fetchall()
        if unicodedata.normalize("NFC", row[1]) != row[1]
    ]
    assert offenders == [], offenders


def test_a_non_ascii_node_is_among_the_chunks_checked(corpus_connection: sqlite3.Connection) -> None:
    non_ascii = [
        (chunk_id, start, end, text_hash, text)
        for chunk_id, start, end, text_hash, text in _chunks(corpus_connection)
        if any(ord(character) > 127 for character in text[start:end])
    ]
    assert non_ascii, "no chunk covers non-ASCII text; the offset rule would be untested"
    for chunk_id, start, end, text_hash, text in non_ascii:
        assert sha256_hex(text[start:end]) == text_hash, chunk_id
        # The distinguishing case: the slice is not the same under byte offsets.
        assert text[start:end].encode("utf-8") != text.encode("utf-8")[start:end] or start == end


def test_node_version_text_hash_covers_the_whole_canonical_text(
    corpus_connection: sqlite3.Connection,
) -> None:
    offenders = [
        row[0]
        for row in corpus_connection.execute(
            "SELECT id, canonical_text, text_hash FROM node_version"
        ).fetchall()
        if sha256_hex(row[1]) != row[2]
    ]
    assert offenders == [], offenders
