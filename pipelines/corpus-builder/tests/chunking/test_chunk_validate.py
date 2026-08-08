"""`validate_chunks()` — one deliberately corrupted chunk per code (CRPS-03 acceptance item 8)."""

from __future__ import annotations

import dataclasses

import pytest
from conftest import node, node_tree, siblings_of

from chunking import (
    CHUNK_VIOLATION_CODES,
    DEFAULT_PROFILE,
    ChunkProfile,
    ChunkViolation,
    NodeVersionInput,
    SearchChunkDraft,
    chunk_document_version,
    chunk_node_version,
    validate_chunks,
)
from contracts.validate import sha256_hex

SENTENCE = "The Commissioner may by written notice require the entity to give a statement. "
TINY = ChunkProfile(
    profile_id="chunk-tiny-v1",
    target_chars=20,
    max_chars=30,
    min_chars=10,
    overlap_chars=0,
    consolidate_within_provision=True,
    split_strategy="sentence",
)


def one_chunk_node() -> tuple[NodeVersionInput, list[SearchChunkDraft]]:
    item = node(node_version_id="nv_one", canonical_text=SENTENCE * 2)
    chunks = list(chunk_node_version(item, DEFAULT_PROFILE))
    assert len(chunks) == 1
    return item, chunks


def two_chunk_node() -> tuple[NodeVersionInput, list[SearchChunkDraft]]:
    paragraph = (SENTENCE * 18).strip()
    item = node(node_version_id="nv_two", canonical_text=paragraph + "\n\n" + paragraph)
    chunks = list(chunk_node_version(item, DEFAULT_PROFILE))
    assert len(chunks) == 2
    return item, chunks


def respan(
    item: NodeVersionInput, chunk: SearchChunkDraft, start: int, end: int
) -> SearchChunkDraft:
    """Move a chunk's offsets and keep its hash and count honest, so only ONE rule is broken."""
    return dataclasses.replace(
        chunk,
        start_offset=start,
        end_offset=end,
        char_count=end - start,
        text_hash=sha256_hex(item.canonical_text[start:end]),
    )


def codes(findings: list[ChunkViolation]) -> list[str]:
    return [finding.code for finding in findings]


def test_the_declared_code_set_is_exactly_the_ticket_list() -> None:
    assert CHUNK_VIOLATION_CODES == frozenset(
        {
            "CHUNK_CROSSES_NODES",
            "CHUNK_OFFSET_OUT_OF_RANGE",
            "CHUNK_OVERLAP",
            "CHUNK_GAP",
            "CHUNK_HASH_MISMATCH",
            "CHUNK_EMPTY",
            "CHUNK_ORDINAL_NONCONTIGUOUS",
            "CHUNK_EXCEEDS_MAX",
            "CHUNK_ILLEGAL_CONSOLIDATION",
        }
    )


def test_an_undeclared_code_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        ChunkViolation(code="NOT_A_CODE", message="nope")


def test_a_conforming_chunk_set_returns_no_findings() -> None:
    item, chunks = two_chunk_node()
    assert validate_chunks(item, chunks, DEFAULT_PROFILE) == []


def test_crosses_nodes() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], node_version_id="nv_somewhere_else")]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_CROSSES_NODES"]


def test_empty() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], start_offset=5, end_offset=5, char_count=0)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_EMPTY"]


def test_offset_out_of_range() -> None:
    item, chunks = one_chunk_node()
    end = len(item.canonical_text) + 10
    corrupted = [dataclasses.replace(chunks[0], end_offset=end, char_count=end)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_OFFSET_OUT_OF_RANGE"]


def test_offset_out_of_range_negative_start() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], start_offset=-1)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_OFFSET_OUT_OF_RANGE"]


def test_hash_mismatch() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], text_hash="0" * 64)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_HASH_MISMATCH"]


def test_hash_mismatch_covers_a_wrong_char_count() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], char_count=chunks[0].char_count + 1)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == ["CHUNK_HASH_MISMATCH"]


def test_exceeds_max() -> None:
    item, chunks = one_chunk_node()
    assert chunks[0].char_count > TINY.max_chars
    assert codes(validate_chunks(item, chunks, TINY)) == ["CHUNK_EXCEEDS_MAX"]


def test_ordinal_noncontiguous() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], chunk_ordinal=3)]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == [
        "CHUNK_ORDINAL_NONCONTIGUOUS"
    ]


def test_overlap() -> None:
    item, chunks = two_chunk_node()
    first = respan(item, chunks[0], chunks[0].start_offset, chunks[1].start_offset + 5)
    assert codes(validate_chunks(item, [first, chunks[1]], DEFAULT_PROFILE)) == ["CHUNK_OVERLAP"]


def test_gap() -> None:
    item, chunks = two_chunk_node()
    first = respan(item, chunks[0], chunks[0].start_offset, chunks[0].end_offset - 20)
    assert codes(validate_chunks(item, [first, chunks[1]], DEFAULT_PROFILE)) == ["CHUNK_GAP"]


def test_illegal_consolidation_of_a_single_node() -> None:
    item, chunks = one_chunk_node()
    corrupted = [dataclasses.replace(chunks[0], consolidated_node_version_ids=("nv_one",))]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == [
        "CHUNK_ILLEGAL_CONSOLIDATION"
    ]


def test_illegal_consolidation_not_anchored_to_the_first_participant() -> None:
    item, chunks = one_chunk_node()
    corrupted = [
        dataclasses.replace(chunks[0], consolidated_node_version_ids=("nv_other", "nv_one"))
    ]
    assert codes(validate_chunks(item, corrupted, DEFAULT_PROFILE)) == [
        "CHUNK_ILLEGAL_CONSOLIDATION"
    ]


def test_illegal_consolidation_is_caught_against_supplied_siblings() -> None:
    """A fabricated group whose second participant is not a sibling (rule 5.3 condition 2)."""
    nodes = [
        node(node_version_id="nv_a", canonical_text="A short provision.", ordinal=0,
             parent_node_version_id="p1"),
        node(node_version_id="nv_b", canonical_text="Another short one.", ordinal=1,
             parent_node_version_id="p2"),
    ]
    produced = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert produced[0].consolidated_node_version_ids == ()
    fabricated = dataclasses.replace(
        produced[0], consolidated_node_version_ids=("nv_a", "nv_b")
    )
    findings = validate_chunks(
        nodes[0], [fabricated], DEFAULT_PROFILE, siblings=siblings_of(nodes)
    )
    assert codes(findings) == ["CHUNK_ILLEGAL_CONSOLIDATION"]


def test_a_legal_consolidation_passes_the_sibling_check() -> None:
    nodes = node_tree(["A short provision. ", "Another short one. "])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    assert result[0].consolidated_node_version_ids == ("nv_leaf_0", "nv_leaf_1")
    anchor = next(item for item in nodes if item.node_version_id == "nv_leaf_0")
    assert validate_chunks(anchor, result, DEFAULT_PROFILE, siblings=siblings_of(nodes)) == []


def test_a_missing_sibling_is_reported_rather_than_assumed_valid() -> None:
    nodes = node_tree(["A short provision. ", "Another short one. "])
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    anchor = next(item for item in nodes if item.node_version_id == "nv_leaf_0")
    findings = validate_chunks(anchor, result, DEFAULT_PROFILE, siblings={"nv_leaf_0": anchor})
    assert codes(findings) == ["CHUNK_ILLEGAL_CONSOLIDATION"]


def test_validate_returns_findings_rather_than_raising_on_nonsense() -> None:
    """A gate that throws on bad data is useless to a build whose job is to find bad data."""
    item = node(node_version_id="nv_x", canonical_text="Some text.")
    nonsense = SearchChunkDraft(
        node_version_id="nv_x",
        chunk_ordinal=-9,
        start_offset=99,
        end_offset=4,
        text_hash="",
        char_count=-1,
        consolidated_node_version_ids=(),
        profile_id="",
    )
    findings = validate_chunks(item, [nonsense], DEFAULT_PROFILE)
    assert findings
    assert all(finding.code in CHUNK_VIOLATION_CODES for finding in findings)
