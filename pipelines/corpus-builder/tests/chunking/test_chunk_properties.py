"""The offset / containment / round-trip property test (acceptance items 1, 2, 3).

DRIVEN BY A SEEDED `random.Random`, NOT BY HYPOTHESIS. A uv workspace member's declared dependency
is not installed by the root `uv sync --frozen` (CRPS-01's E1), so a Hypothesis-only property test
would silently SKIP in exactly the environment CI runs — and an acceptance criterion that skips is
worse than no criterion. The generator below therefore runs everywhere, and the same invariant body
is additionally driven by Hypothesis where the library happens to be importable, so the check is
strictly stronger there and never weaker here.

The seeds are fixed, so a failure is reproducible: the failing seed is in the assertion message.
"""

from __future__ import annotations

import importlib.util
import random
import unicodedata

import pytest
from conftest import node, siblings_of

from chunking import (
    DEFAULT_PROFILE,
    NodeVersionInput,
    chunk_document_version,
    chunk_node_version,
    validate_chunks,
)
from contracts.validate import sha256_hex

ASCII_SENTENCES = [
    "An entity must keep records that explain the transactions it engages in. ",
    "The Commissioner may, by written notice, require a statement in the approved form. ",
    "Subsection (2) does not apply to an entity prescribed by the rules. ",
    "See s. 15 and cl. 4 of Schedule 1 for the meaning of approved form. ",
    "1. The first item. 2. The second item. 3. The third item. ",
    "Records must be retained for 5 years; e.g. from the end of the income year. ",
]

UNICODE_SENTENCES = [
    "Le décret précise les modalités de conservation des documents. ",
    "第十二条 事業者は、記録を五年間保存しなければならない。 ",
    "Die Frist beträgt fünf Jahre ab dem Ende des Kalenderjahres. ",
    "Ο φορέας διατηρεί τα αρχεία για πέντε έτη. ",
    "Ко́мбинирующие зна́ки то́же встреча́ются в те́ксте. ",
    "q̣̇ marks stack on a base character. ",
    "An emoji sneaks in: \U0001f9fe receipts and \U0001f4c4 documents. ",
]

NODE_KINDS = ["section", "subsection", "heading", "note"]
PARENTS = [None, "nv_parent_a", "nv_parent_b"]


def _make_text(rng: random.Random, target: int) -> str:
    if target == 0:
        return rng.choice(["", "   ", "\n\n \t\n"])
    parts: list[str] = []
    length = 0
    while length < target:
        roll = rng.random()
        if roll < 0.08:
            piece = "\n\n"
        elif roll < 0.13:
            # An unbroken token with no whitespace at all: the hard-cut path, and the shape a
            # hostile source document would use to hunt for quadratic behaviour.
            piece = "".join(rng.choice("ABCDEFGHIJ.") for _ in range(rng.randint(50, 900)))
        elif roll < 0.55:
            piece = rng.choice(ASCII_SENTENCES)
        else:
            piece = rng.choice(UNICODE_SENTENCES)
        parts.append(piece)
        length += len(piece)
    return unicodedata.normalize("NFC", "".join(parts)[:target])


def _target_length(rng: random.Random) -> int:
    if rng.random() < 0.04:
        return rng.randint(8_000, 20_000)
    return rng.choice([0, 3, 40, 150, 199, 400, 1_200, 2_000, 2_001, 3_500])


def make_nodes(rng: random.Random) -> list[NodeVersionInput]:
    count = rng.randint(2, 12)
    nodes: list[NodeVersionInput] = []
    ordinal = rng.randint(0, 3)
    parent = rng.choice(PARENTS)
    kind = rng.choice(NODE_KINDS)
    for index in range(count):
        if rng.random() < 0.25:
            parent = rng.choice(PARENTS)
        if rng.random() < 0.25:
            kind = rng.choice(NODE_KINDS)
        ordinal += rng.choice([1, 1, 1, 2, 0])
        nodes.append(
            node(
                node_version_id=f"nv_{index}",
                canonical_text=_make_text(rng, _target_length(rng)),
                ordinal=ordinal,
                node_kind=kind,
                parent_node_version_id=parent,
            )
        )
    return nodes


def check_invariants(nodes: list[NodeVersionInput], label: str) -> None:
    profile = DEFAULT_PROFILE
    result = chunk_document_version(nodes, profile)
    identities = {item.node_version_id for item in nodes}
    siblings = siblings_of(nodes)
    per_node: dict[str, list[int]] = {}

    for chunk in result:
        assert chunk.node_version_id in identities, label
        owner = siblings[chunk.node_version_id]
        text = owner.canonical_text
        assert 0 <= chunk.start_offset < chunk.end_offset <= len(text), label
        piece = text[chunk.start_offset : chunk.end_offset]
        assert chunk.text_hash == sha256_hex(piece), label
        assert chunk.char_count == chunk.end_offset - chunk.start_offset, label
        assert chunk.char_count <= profile.max_chars, label
        assert chunk.profile_id == profile.profile_id, label
        per_node.setdefault(chunk.node_version_id, []).append(chunk.chunk_ordinal)

    for identity, ordinals in per_node.items():
        assert ordinals == list(range(len(ordinals))), f"{label}: {identity} ordinals {ordinals}"

    for item in nodes:
        own = [chunk for chunk in result if chunk.node_version_id == item.node_version_id]
        assert validate_chunks(item, own, profile, siblings=siblings) == [], label
        if not item.canonical_text.strip():
            assert own == [], f"{label}: {item.node_version_id} has no content but produced chunks"
        # A node that emits nothing is either empty or a non-anchor consolidation participant.
        if not own and item.canonical_text.strip():
            assert any(
                item.node_version_id in chunk.consolidated_node_version_ids for chunk in result
            ), f"{label}: {item.node_version_id} vanished"

    # Re-running is byte-identical (rule 6, in-process half of the determinism check).
    again = chunk_document_version(nodes, profile)
    assert [chunk.to_json() for chunk in again] == [chunk.to_json() for chunk in result], label
    assert again.hard_split == result.hard_split
    assert again.consolidated == result.consolidated


@pytest.mark.parametrize("seed", range(150))
def test_generated_node_trees_hold_every_offset_invariant(seed: int) -> None:
    check_invariants(make_nodes(random.Random(seed)), f"seed={seed}")


def test_single_node_entry_point_holds_the_same_invariants() -> None:
    rng = random.Random(9_001)
    for index in range(60):
        item = node(
            node_version_id=f"nv_solo_{index}",
            canonical_text=_make_text(rng, _target_length(rng)),
        )
        result = chunk_node_version(item, DEFAULT_PROFILE)
        assert validate_chunks(item, result, DEFAULT_PROFILE) == [], index
        for chunk in result:
            piece = item.canonical_text[chunk.start_offset : chunk.end_offset]
            assert chunk.text_hash == sha256_hex(piece)
            assert chunk.char_count <= DEFAULT_PROFILE.max_chars


@pytest.mark.skipif(
    importlib.util.find_spec("hypothesis") is None,
    reason="hypothesis is not importable in this environment; the seeded generator above is the "
    "always-on property check (see the module docstring)",
)
def test_generated_node_trees_hold_every_offset_invariant_under_hypothesis() -> None:
    from hypothesis import HealthCheck, given, settings
    from hypothesis import strategies as st

    @given(st.integers(min_value=0, max_value=2**31 - 1))
    @settings(deadline=None, max_examples=50, suppress_health_check=list(HealthCheck))
    def inner(seed: int) -> None:
        check_invariants(make_nodes(random.Random(seed)), f"hypothesis seed={seed}")

    inner()
