"""Hand-written boundary cases (CRPS-03 rules 5.2, 5.4, 5.5; acceptance items 2, 3, 5, 7)."""

from __future__ import annotations

import unicodedata

import pytest
from conftest import node

from chunking import (
    DEFAULT_PROFILE,
    ChunkProfile,
    chunk_node_version,
    validate_chunks,
)
from contracts.validate import sha256_hex

SENTENCE = "The Commissioner may by written notice require the entity to give a statement. "
PARAGRAPH = SENTENCE * 18  # ~1,400 characters: one paragraph, comfortably under max_chars.


def slices(item, chunks) -> list[str]:
    return [item.canonical_text[chunk.start_offset : chunk.end_offset] for chunk in chunks]


def assert_covers(item, chunks) -> None:
    """Rule 5.5: the chunks jointly cover the text apart from boundary whitespace."""
    joined = "".join(slices(item, chunks))
    assert "".join(joined.split()) == "".join(item.canonical_text.split())


@pytest.mark.parametrize("text", ["", "   ", "\n\n\t \n", " "])
def test_a_structural_container_with_no_text_produces_zero_chunks(text: str) -> None:
    """Acceptance item 7 / rule 5.4 — zero chunks, never an empty chunk."""
    container = node(node_version_id="nv_part", canonical_text=text, node_kind="part")
    result = chunk_node_version(container, DEFAULT_PROFILE)
    assert list(result) == []
    assert result.hard_split == 0
    assert validate_chunks(container, result, DEFAULT_PROFILE) == []


def test_a_short_node_yields_exactly_one_chunk() -> None:
    """`min_chars` is rule 5.3's, not an intra-node minimum: a short node is one chunk."""
    short = node(node_version_id="nv_s", canonical_text="  Two words.  ")
    result = chunk_node_version(short, DEFAULT_PROFILE)
    assert len(result) == 1
    chunk = result[0]
    assert short.canonical_text[chunk.start_offset : chunk.end_offset] == "Two words."
    assert chunk.chunk_ordinal == 0
    assert chunk.char_count == 10
    assert chunk.consolidated_node_version_ids == ()
    assert chunk.profile_id == DEFAULT_PROFILE.profile_id


def test_a_sentence_longer_than_max_is_hard_split_and_counted() -> None:
    """Acceptance item 5 / rule 5.2 — the only case where a hard cut is permitted."""
    text = "A" * 5000  # one unbroken "sentence" with no whitespace at all
    item = node(node_version_id="nv_long", canonical_text=text)
    result = chunk_node_version(item, DEFAULT_PROFILE)
    assert result.hard_split == 2  # cut points introduced: 5000 / 2000 -> 2
    assert [chunk.char_count for chunk in result] == [2000, 2000, 1000]
    assert all(chunk.char_count <= DEFAULT_PROFILE.max_chars for chunk in result)
    assert [chunk.chunk_ordinal for chunk in result] == [0, 1, 2]
    assert_covers(item, result)
    assert validate_chunks(item, result, DEFAULT_PROFILE) == []


def test_no_hard_split_when_sentences_fit() -> None:
    """A long paragraph of ordinary sentences never reaches a hard cut."""
    text = SENTENCE * 60  # ~4,700 characters in one paragraph
    item = node(node_version_id="nv_para", canonical_text=text)
    result = chunk_node_version(item, DEFAULT_PROFILE)
    assert result.hard_split == 0
    assert len(result) > 1
    assert all(chunk.char_count <= DEFAULT_PROFILE.max_chars for chunk in result)
    # Every chunk boundary falls at a sentence end.
    for piece in slices(item, result):
        assert piece.endswith(".")
    assert_covers(item, result)
    assert validate_chunks(item, result, DEFAULT_PROFILE) == []


def test_paragraph_is_preferred_over_sentence() -> None:
    """Rule 5.2's ladder: a paragraph that fits is never subdivided."""
    text = PARAGRAPH.strip() + "\n\n" + PARAGRAPH.strip()
    item = node(node_version_id="nv_two_paragraphs", canonical_text=text)
    result = chunk_node_version(item, DEFAULT_PROFILE)
    assert len(result) == 2
    first, second = slices(item, result)
    assert first == PARAGRAPH.strip()
    assert second == PARAGRAPH.strip()
    assert_covers(item, result)
    assert validate_chunks(item, result, DEFAULT_PROFILE) == []


def test_coverage_non_overlap_and_ordinals_on_a_mixed_node() -> None:
    """Acceptance item 3 — contiguous, non-overlapping, ordinal-contiguous from 0."""
    text = "\n\n".join([PARAGRAPH.strip(), SENTENCE.strip(), "B" * 4500, PARAGRAPH.strip()])
    item = node(node_version_id="nv_mixed", canonical_text=text)
    result = chunk_node_version(item, DEFAULT_PROFILE)
    assert [chunk.chunk_ordinal for chunk in result] == list(range(len(result)))
    for left, right in zip(result, result[1:]):
        assert left.end_offset <= right.start_offset
        assert not text[left.end_offset : right.start_offset].strip()
    assert_covers(item, result)
    assert validate_chunks(item, result, DEFAULT_PROFILE) == []


def test_offsets_survive_a_renormalisation_of_the_source_text() -> None:
    """Acceptance item 2 — re-slicing after an NFC re-normalisation is unchanged."""
    text = (
        "Le décret s'applique aux sociétés. "
        "第一条 本法の目的は、課税の公平を確保することにある。 "
        "Ångström and éclair are both here. "  # a combining acute, NFC-composed on input
    ) * 12
    item = node(node_version_id="nv_unicode", canonical_text=text)
    result = chunk_node_version(item, DEFAULT_PROFILE)
    assert result
    stored = item.canonical_text
    renormalised = unicodedata.normalize("NFC", stored)
    assert renormalised == stored
    for chunk in result:
        piece = renormalised[chunk.start_offset : chunk.end_offset]
        assert sha256_hex(piece) == chunk.text_hash
        assert len(piece) == chunk.char_count
    assert validate_chunks(item, result, DEFAULT_PROFILE) == []


def test_text_exactly_at_and_one_over_max_chars() -> None:
    profile = DEFAULT_PROFILE
    exact = node(node_version_id="nv_exact", canonical_text="C" * profile.max_chars)
    assert [chunk.char_count for chunk in chunk_node_version(exact, profile)] == [profile.max_chars]
    over = node(node_version_id="nv_over", canonical_text="C" * (profile.max_chars + 1))
    result = chunk_node_version(over, profile)
    assert [chunk.char_count for chunk in result] == [profile.max_chars, 1]
    assert result.hard_split == 1


def test_a_combining_mark_run_never_starts_a_chunk() -> None:
    """A hard cut is nudged left off a combining mark so a piece never opens with one."""
    profile = ChunkProfile(
        profile_id="chunk-tiny-v1",
        target_chars=20,
        max_chars=31,
        min_chars=10,
        overlap_chars=0,
        consolidate_within_provision=True,
        split_strategy="sentence",
    )
    # `q` plus two combining marks: no precomposed form exists, so this stays decomposed under
    # NFC and a raw cut at a multiple of `max_chars` would otherwise land on a mark.
    text = unicodedata.normalize("NFC", "q̣̇" * 20)
    assert unicodedata.combining(text[31]) != 0
    item = node(node_version_id="nv_marks", canonical_text=text)
    result = chunk_node_version(item, profile)
    assert len(result) > 1
    for chunk in result:
        assert unicodedata.combining(text[chunk.start_offset]) == 0
        assert chunk.char_count <= profile.max_chars
    assert_covers(item, result)
    assert validate_chunks(item, result, profile) == []


def test_paragraph_strategy_never_uses_sentence_boundaries() -> None:
    profile = ChunkProfile(
        profile_id="chunk-paragraph-v1",
        target_chars=1200,
        max_chars=2000,
        min_chars=200,
        overlap_chars=0,
        consolidate_within_provision=True,
        split_strategy="paragraph",
    )
    item = node(node_version_id="nv_pstrategy", canonical_text=SENTENCE * 40)
    result = chunk_node_version(item, profile)
    # One over-long paragraph, no sentence fallback: hard cuts are the only remaining boundary.
    assert result.hard_split > 0
    assert all(chunk.char_count <= profile.max_chars for chunk in result)
    assert validate_chunks(item, result, profile) == []
