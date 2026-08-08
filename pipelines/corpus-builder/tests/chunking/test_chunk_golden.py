"""The golden legislative fixture, byte-for-byte (CRPS-03 `[fixture]` acceptance item)."""

from __future__ import annotations

import json
from pathlib import Path

from conftest import FIXTURES, siblings_of
from regenerate_golden import GOLDEN_PATH, TREE_PATH, build_golden, load_tree, render

from chunking import (
    CHUNKER_VERSION,
    DEFAULT_PROFILE,
    SEGMENTER_VERSION,
    chunk_document_version,
    profile_fingerprint,
    validate_chunks,
)


def read_bytes(path: Path) -> bytes:
    with open(path, "rb") as handle:
        return handle.read()


def test_the_fixture_chunks_to_the_golden_output_byte_for_byte() -> None:
    assert render(build_golden(load_tree())) == read_bytes(GOLDEN_PATH)


def test_the_golden_file_pins_the_versions_and_the_counters() -> None:
    """A silent boundary change fails here instead of being quietly regenerated away."""
    golden = json.loads(read_bytes(GOLDEN_PATH).decode("utf-8"))
    result = chunk_document_version(load_tree(), DEFAULT_PROFILE)
    assert golden["chunker_version"] == CHUNKER_VERSION
    assert golden["segmenter_version"] == SEGMENTER_VERSION
    assert golden["profile_fingerprint"] == profile_fingerprint(DEFAULT_PROFILE)
    assert golden["profile_id"] == DEFAULT_PROFILE.profile_id
    assert golden["hard_split"] == result.hard_split
    assert golden["consolidated"] == result.consolidated
    assert golden["chunks"] == [draft.to_json() for draft in result]


def test_the_fixture_exercises_every_shape_the_ticket_names() -> None:
    """Part → Division → section → subsection, one very long, one two-word, a heading, non-ASCII."""
    nodes = load_tree()
    kinds = [item.node_kind for item in nodes]
    assert {"part", "division", "section", "subsection", "heading"} <= set(kinds)
    assert any(not item.canonical_text.strip() for item in nodes)  # a structural container
    assert any(len(item.canonical_text) > 5000 for item in nodes)  # the very long subsection
    assert any(len(item.canonical_text.split()) == 2 for item in nodes)  # the two-word subsection
    assert any(not item.canonical_text.isascii() for item in nodes)  # the non-ASCII node

    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert result.hard_split > 0  # the unbroken token forces a hard cut
    assert result.consolidated > 0  # the two short subsections consolidate
    siblings = siblings_of(nodes)
    for item in nodes:
        own = [chunk for chunk in result if chunk.node_version_id == item.node_version_id]
        assert validate_chunks(item, own, DEFAULT_PROFILE, siblings=siblings) == []


def test_both_fixture_files_are_stored_with_lf_endings() -> None:
    """`.gitattributes` guard: a CRLF checkout would fail the byte comparison on Windows only."""
    for path in (TREE_PATH, GOLDEN_PATH):
        assert b"\r\n" not in read_bytes(path), path


def test_the_fixture_lives_where_the_ticket_says() -> None:
    assert TREE_PATH.parent == FIXTURES
    assert TREE_PATH.name == "legislative_tree.json"
    assert GOLDEN_PATH.name == "expected_chunks.json"
