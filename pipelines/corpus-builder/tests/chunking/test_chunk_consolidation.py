"""Rule 5.3 — consolidation happens only inside one provision (acceptance items 1, 6)."""

from __future__ import annotations

from conftest import node, node_tree, siblings_of

from chunking import (
    DEFAULT_PROFILE,
    ChunkProfile,
    NodeVersionInput,
    chunk_document_version,
    validate_chunks,
)
from contracts.validate import sha256_hex

SHORT = "The entity must keep the record for five years. "  # 47 characters
NARROW = ChunkProfile(
    profile_id="chunk-narrow-v1",
    target_chars=200,
    max_chars=250,
    min_chars=200,
    overlap_chars=0,
    consolidate_within_provision=True,
    split_strategy="sentence",
)


def assert_no_chunk_spans_two_nodes(nodes: list[NodeVersionInput], chunks) -> None:
    """Acceptance item 1: every chunk re-slices from its OWN node's text and hashes identically."""
    by_id = siblings_of(nodes)
    for chunk in chunks:
        owner = by_id[chunk.node_version_id]
        piece = owner.canonical_text[chunk.start_offset : chunk.end_offset]
        assert sha256_hex(piece) == chunk.text_hash
        assert len(piece) == chunk.char_count
        assert chunk.end_offset <= len(owner.canonical_text)


def assert_nothing_consolidated(chunks) -> None:
    assert [chunk.consolidated_node_version_ids for chunk in chunks] == [()] * len(chunks)


def test_three_short_siblings_consolidate_into_one_chunk() -> None:
    nodes = node_tree([SHORT, SHORT * 2, SHORT])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert result.consolidated == 1
    assert len(result) == 1
    chunk = result[0]
    assert chunk.node_version_id == "nv_leaf_0"
    assert chunk.chunk_ordinal == 0
    assert chunk.consolidated_node_version_ids == ("nv_leaf_0", "nv_leaf_1", "nv_leaf_2")
    # Offsets and hash stay anchored to the FIRST participant's own text.
    anchor = nodes[3]
    assert anchor.canonical_text[chunk.start_offset : chunk.end_offset] == SHORT.strip()
    assert chunk.text_hash == sha256_hex(SHORT.strip())
    assert_no_chunk_spans_two_nodes(nodes, result)
    for item in nodes:
        assert (
            validate_chunks(
                item,
                [c for c in result if c.node_version_id == item.node_version_id],
                DEFAULT_PROFILE,
                siblings=siblings_of(nodes),
            )
            == []
        )


def test_exactly_two_eligible_siblings_consolidate() -> None:
    nodes = node_tree([SHORT, SHORT])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 1
    assert result[0].consolidated_node_version_ids == ("nv_leaf_0", "nv_leaf_1")


def test_a_group_closes_deterministically_at_the_max_chars_boundary() -> None:
    """Three eligible siblings, but the third would overflow: the group closes at two."""
    nodes = node_tree([SHORT * 2, SHORT * 2, SHORT * 2])  # 93 characters each once trimmed
    assert 3 * len((SHORT * 2).strip()) > NARROW.max_chars >= 2 * len((SHORT * 2).strip())
    result = chunk_document_version(nodes, NARROW)
    assert result.consolidated == 1
    assert [chunk.node_version_id for chunk in result] == ["nv_leaf_0", "nv_leaf_2"]
    assert [chunk.consolidated_node_version_ids for chunk in result] == [
        ("nv_leaf_0", "nv_leaf_1"),
        (),
    ]


def test_negative_different_parent() -> None:
    """Rule 5.3 condition 2."""
    nodes = [
        node(node_version_id="nv_a", canonical_text=SHORT, ordinal=0, parent_node_version_id="p1"),
        node(node_version_id="nv_b", canonical_text=SHORT, ordinal=1, parent_node_version_id="p2"),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 2
    assert result.consolidated == 0
    assert_nothing_consolidated(result)
    assert_no_chunk_spans_two_nodes(nodes, result)


def test_negative_different_document_version() -> None:
    """Rule 5.3 condition 1."""
    nodes = [
        node(node_version_id="nv_a", canonical_text=SHORT, ordinal=0, parent_node_version_id="p1"),
        node(
            node_version_id="nv_b",
            canonical_text=SHORT,
            ordinal=1,
            parent_node_version_id="p1",
            document_version_id="dv_00000000-0000-7000-8000-00000000000f",
        ),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 2
    assert_nothing_consolidated(result)


def test_negative_non_contiguous_ordinals() -> None:
    """Rule 5.3 condition 3."""
    nodes = [
        node(node_version_id="nv_a", canonical_text=SHORT, ordinal=0, parent_node_version_id="p1"),
        node(node_version_id="nv_b", canonical_text=SHORT, ordinal=2, parent_node_version_id="p1"),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 2
    assert_nothing_consolidated(result)


def test_negative_combined_over_max_chars() -> None:
    """Rule 5.3 condition 4."""
    text = SHORT * 3  # 141 characters: eligible on its own, two of them overflow NARROW.max_chars
    nodes = [
        node(node_version_id="nv_a", canonical_text=text, ordinal=0, parent_node_version_id="p1"),
        node(node_version_id="nv_b", canonical_text=text, ordinal=1, parent_node_version_id="p1"),
    ]
    assert 2 * len(text.strip()) > NARROW.max_chars
    result = chunk_document_version(nodes, NARROW)
    assert len(result) == 2
    assert_nothing_consolidated(result)


def test_negative_a_participant_reaches_min_chars() -> None:
    """Rule 5.3 condition 5."""
    long_enough = SHORT * 6  # 281 characters, over min_chars
    assert len(long_enough.strip()) >= DEFAULT_PROFILE.min_chars
    nodes = [
        node(node_version_id="nv_a", canonical_text=SHORT, ordinal=0, parent_node_version_id="p1"),
        node(
            node_version_id="nv_b",
            canonical_text=long_enough,
            ordinal=1,
            parent_node_version_id="p1",
        ),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 2
    assert_nothing_consolidated(result)


def test_negative_a_heading_never_consolidates_with_operative_text() -> None:
    """Rule 5.3 — implemented as "every participant shares one node_kind" (see README)."""
    nodes = [
        node(
            node_version_id="nv_h",
            canonical_text="Division 3 — Record keeping",
            ordinal=0,
            node_kind="heading",
            parent_node_version_id="p1",
        ),
        node(
            node_version_id="nv_b",
            canonical_text=SHORT,
            ordinal=1,
            node_kind="subsection",
            parent_node_version_id="p1",
        ),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert len(result) == 2
    assert_nothing_consolidated(result)
    assert_no_chunk_spans_two_nodes(nodes, result)


def test_negative_an_empty_node_neither_anchors_nor_joins() -> None:
    """Rule 5.4 beats rule 5.3: a node with no content produces zero chunks."""
    nodes = [
        node(node_version_id="nv_a", canonical_text=SHORT, ordinal=0, parent_node_version_id="p1"),
        node(node_version_id="nv_empty", canonical_text="  \n ", ordinal=1, parent_node_version_id="p1"),
        node(node_version_id="nv_c", canonical_text=SHORT, ordinal=2, parent_node_version_id="p1"),
    ]
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert [chunk.node_version_id for chunk in result] == ["nv_a", "nv_c"]
    assert_nothing_consolidated(result)


def test_consolidation_disabled_by_the_profile() -> None:
    profile = ChunkProfile(
        profile_id="chunk-no-consolidation-v1",
        target_chars=1200,
        max_chars=2000,
        min_chars=200,
        overlap_chars=0,
        consolidate_within_provision=False,
        split_strategy="sentence",
    )
    nodes = node_tree([SHORT, SHORT, SHORT])
    result = chunk_document_version(nodes, profile)
    assert len(result) == 3
    assert result.consolidated == 0
    assert_nothing_consolidated(result)


def test_hard_split_is_summed_across_the_document() -> None:
    nodes = node_tree(["A" * 5000, "B" * 3000, SHORT])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert result.hard_split == 3  # 2 cut points in the first node, 1 in the second
    assert_no_chunk_spans_two_nodes(nodes, result)


def test_the_result_is_a_plain_list_for_every_caller() -> None:
    """Deliverable 2 declares `list[SearchChunkDraft]`; the counters ride along on a subclass."""
    nodes = node_tree([SHORT, SHORT])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert isinstance(result, list)
    assert result == [result[0]]
    assert list(result) == [result[0]]
