"""`assign_tiers` and `tier_distribution` — CRPS-04 deliverables 4 and 6 (acceptance item 9).

The 1,000-chunk report is built THROUGH `assign_tiers` over synthetic chunks and inputs, so the
real batch entry point is exercised rather than a hand-made assignment list.
"""

from __future__ import annotations

import json

import pytest
from conftest import FakeChunk, make_input
from tiering import (
    REASON_CODES,
    ChunkStructure,
    IndexTier,
    LicenceStatus,
    MissingTieringInput,
    TieringInput,
    assign_tier,
    assign_tiers,
    tier_distribution,
)

GROUPS = ("grp_test_1", "grp_test_2", "grp_test_3")

# One node per (group, shape); the shapes deliberately span all five tiers.
_SHAPES: tuple[dict[str, object], ...] = (
    {"source_initial_tier": "T1"},
    {"source_initial_tier": "T2"},
    {"source_initial_tier": "T3"},
    {"source_initial_tier": "T1", "licence_permits_embedding": False},
    {"source_initial_tier": "T1", "licence_status": LicenceStatus.UNCLEAR_RESTRICTED},
    {"source_initial_tier": "T2", "licence_status": LicenceStatus.PROHIBITED},
    {"source_initial_tier": "T1", "quarantine_open": True},
    {"source_initial_tier": "T3", "is_evidence_bearing": False},
    {"source_initial_tier": "T1", "licence_permits_storage": False},
    {"source_initial_tier": "T2", "licence_permits_indexing": False},
)


def _corpus() -> tuple[list[FakeChunk], dict[str, TieringInput]]:
    """1,000 chunks over 30 nodes (3 source groups x 10 shapes), deterministic."""
    inputs: dict[str, TieringInput] = {}
    nodes: list[str] = []
    for group in GROUPS:
        for index, shape in enumerate(_SHAPES):
            node_version_id = f"nv_{group}_{index}"
            inputs[node_version_id] = make_input(source_group_id=group, **shape)
            nodes.append(node_version_id)

    chunks: list[FakeChunk] = []
    ordinal_by_node: dict[str, int] = dict.fromkeys(nodes, 0)
    for position in range(1000):
        node_version_id = nodes[position % len(nodes)]
        ordinal = ordinal_by_node[node_version_id]
        ordinal_by_node[node_version_id] = ordinal + 1
        chunks.append(
            FakeChunk(
                node_version_id=node_version_id,
                chunk_ordinal=ordinal,
                char_count=100 + (position % 7),
            )
        )
    return chunks, inputs


def test_a_fake_chunk_satisfies_the_structural_protocol() -> None:
    """Deliverable 4: a chunk is consumed structurally, without importing `chunking`."""
    chunk = FakeChunk(node_version_id="nv_1", chunk_ordinal=0, char_count=10)
    assert isinstance(chunk, ChunkStructure)


def test_assign_tiers_preserves_input_order_and_length() -> None:
    chunks, inputs = _corpus()
    assignments = assign_tiers(chunks, inputs)
    assert len(assignments) == len(chunks) == 1000
    for chunk, assignment in zip(chunks, assignments, strict=True):
        assert assignment.node_version_id == chunk.node_version_id
        assert assignment.chunk_ordinal == chunk.chunk_ordinal
        assert assignment.char_count == chunk.char_count
        assert assignment.source_group_id == inputs[chunk.node_version_id].source_group_id


def test_every_chunk_of_a_node_gets_the_same_tier_and_reason() -> None:
    chunks, inputs = _corpus()
    assignments = assign_tiers(chunks, inputs)
    per_node: dict[str, set[tuple[IndexTier, str]]] = {}
    for assignment in assignments:
        per_node.setdefault(assignment.node_version_id, set()).add(
            (assignment.tier, assignment.reason_code)
        )
    for node_version_id, outcomes in per_node.items():
        assert len(outcomes) == 1
        expected = assign_tier(inputs[node_version_id])
        assert outcomes == {(expected.tier, expected.reason_code)}


def test_assign_tiers_is_empty_for_no_chunks() -> None:
    assert assign_tiers([], {}) == []


def test_a_chunk_whose_node_has_no_input_fails_closed() -> None:
    """Never "assume permitted": an unassessed node is a build error naming the node."""
    chunks, inputs = _corpus()
    orphan = FakeChunk(node_version_id="nv_orphan", chunk_ordinal=0, char_count=10)
    with pytest.raises(MissingTieringInput) as excinfo:
        assign_tiers([*chunks[:5], orphan], inputs)
    assert "nv_orphan" in str(excinfo.value)


def test_assign_tiers_does_not_mutate_its_inputs() -> None:
    chunks, inputs = _corpus()
    before = dict(inputs)
    assign_tiers(chunks, inputs)
    assert inputs == before


# --------------------------------------------------------------------------------- the report
def test_report_totals_match_the_input() -> None:
    chunks, inputs = _corpus()
    assignments = assign_tiers(chunks, inputs)
    report = tier_distribution(assignments)

    assert report.total_chunks == 1000
    assert report.total_chars == sum(chunk.char_count for chunk in chunks)
    assert sum(count.chunks for count in report.by_tier.values()) == report.total_chunks
    assert sum(count.chars for count in report.by_tier.values()) == report.total_chars
    assert sum(report.by_reason.values()) == report.total_chunks


def test_report_groups_sum_to_the_totals() -> None:
    chunks, inputs = _corpus()
    report = tier_distribution(assign_tiers(chunks, inputs))

    assert set(report.by_source_group) == set(GROUPS)
    group_chunks = sum(
        count.chunks for group in report.by_source_group.values() for count in group.values()
    )
    group_chars = sum(
        count.chars for group in report.by_source_group.values() for count in group.values()
    )
    assert group_chunks == report.total_chunks
    assert group_chars == report.total_chars


def test_every_tier_is_present_and_zero_filled() -> None:
    """A downstream reader never has to distinguish "absent" from "zero"."""
    chunks, inputs = _corpus()
    report = tier_distribution(assign_tiers(chunks, inputs))
    assert set(report.by_tier) == set(IndexTier)
    for group in report.by_source_group.values():
        assert set(group) == set(IndexTier)


def test_all_five_tiers_are_exercised_by_the_synthetic_corpus() -> None:
    """A report test that only ever saw one tier would prove very little."""
    chunks, inputs = _corpus()
    report = tier_distribution(assign_tiers(chunks, inputs))
    assert all(report.by_tier[tier].chunks > 0 for tier in IndexTier)


def test_reason_counts_are_declared_codes() -> None:
    chunks, inputs = _corpus()
    report = tier_distribution(assign_tiers(chunks, inputs))
    assert set(report.by_reason) <= set(REASON_CODES)
    assert report.by_reason


def test_an_empty_assignment_set_reports_all_zeroes() -> None:
    report = tier_distribution([])
    assert report.total_chunks == 0
    assert report.total_chars == 0
    assert set(report.by_tier) == set(IndexTier)
    assert all(count.chunks == 0 and count.chars == 0 for count in report.by_tier.values())
    assert dict(report.by_source_group) == {}
    assert dict(report.by_reason) == {}
    assert report.to_dict()["total_chunks"] == 0


def test_to_dict_is_deterministic_and_json_round_trippable() -> None:
    chunks, inputs = _corpus()
    report = tier_distribution(assign_tiers(chunks, inputs))
    first = json.dumps(report.to_dict(), sort_keys=False)
    second = json.dumps(report.to_dict(), sort_keys=False)
    assert first == second
    restored = json.loads(first)
    assert restored["total_chunks"] == report.total_chunks
    assert list(restored["by_tier"]) == [tier.value for tier in IndexTier]
    assert list(restored["by_source_group"]) == sorted(GROUPS)
    assert list(restored["by_reason"]) == sorted(report.by_reason)


def test_report_mappings_are_read_only() -> None:
    """Two workers must not be able to observe (or cause) a partially built report."""
    report = tier_distribution([])
    with pytest.raises(TypeError):
        report.by_tier[IndexTier.TIER_1_FULL_SEMANTIC] = None  # type: ignore[index]
    with pytest.raises(TypeError):
        report.by_reason["INVENTED"] = 1  # type: ignore[index]
    with pytest.raises(TypeError):
        report.by_source_group["grp"] = {}  # type: ignore[index]
