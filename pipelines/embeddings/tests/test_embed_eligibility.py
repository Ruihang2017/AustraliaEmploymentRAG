"""Only dense-eligible chunks are embedded (CRPS-05 acceptance item 1; test plan step 3).

PRD §17.2: "Tier 1 receives full dense indexing; Tier 2 selective/on-demand dense indexing; Tier 3
no default embedding." CRPS-04's `is_eligible_for_dense()` is the single definition and this suite
asserts against IT, parametrised over `list(IndexTier)` — so a sixth tier added to the vocabulary
fails here rather than silently defaulting to one behaviour or the other.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from contracts.schema import open_corpus_database
from embedding_fixtures import CorpusFixture, RecordingWriter
from embeddings.build import build_embeddings
from embeddings.errors import IneligibleTierRequested, UntieredChunk
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider
from embeddings.selection import DEFAULT_TIERS, resolve_requested_tiers, select_chunks
from tiering import IndexTier, is_default_dense, is_eligible_for_dense

ALL_TIERS = tuple(IndexTier)
ELIGIBLE = tuple(tier for tier in ALL_TIERS if is_eligible_for_dense(tier))
INELIGIBLE = tuple(tier for tier in ALL_TIERS if not is_eligible_for_dense(tier))


def _run(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    out_dir: Path,
    *,
    tiers=None,
):
    writer = RecordingWriter()
    result = build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        DeterministicStubProvider(
            seed=pinned_profile.profile.seed, dimensions=pinned_profile.profile.dimensions
        ),
        runtime_pin_fixture,
        out_dir,
        tiers=tiers,
        writer=writer,
    )
    return result, writer


def test_the_default_selection_is_tier_1_only() -> None:
    """PRD §17.2 makes Tier 2 SELECTIVE; defaulting to it would embed the whole long tail."""
    assert DEFAULT_TIERS() == (IndexTier.TIER_1_FULL_SEMANTIC,)
    assert all(is_default_dense(tier) for tier in DEFAULT_TIERS())
    assert resolve_requested_tiers(None) == DEFAULT_TIERS()


@pytest.mark.parametrize("tier", ALL_TIERS, ids=lambda tier: tier.value)
def test_requesting_a_tier_agrees_with_is_eligible_for_dense(tier: IndexTier) -> None:
    if is_eligible_for_dense(tier):
        assert resolve_requested_tiers([tier.value]) == (tier,)
    else:
        with pytest.raises(IneligibleTierRequested) as excinfo:
            resolve_requested_tiers([tier.value])
        assert tier.value in str(excinfo.value)


def test_an_unknown_tier_name_is_refused_not_ignored() -> None:
    with pytest.raises(IneligibleTierRequested):
        resolve_requested_tiers(["TIER_0_EVERYTHING"])


def test_empty_tier_list_is_refused() -> None:
    with pytest.raises(IneligibleTierRequested):
        resolve_requested_tiers([])


def test_only_tier_1_is_embedded_by_default(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    result, writer = _run(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    expected = corpus_fixture.eligible_chunk_ids([IndexTier.TIER_1_FULL_SEMANTIC])
    assert tuple(sorted(writer.keys)) == expected
    assert result.embedded_count == len(expected)


def test_both_eligible_tiers_can_be_requested(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    _, writer = _run(
        corpus_fixture,
        pinned_profile,
        runtime_pin_fixture,
        out_dir,
        tiers=[tier.value for tier in ELIGIBLE],
    )
    assert tuple(sorted(writer.keys)) == corpus_fixture.eligible_chunk_ids(ELIGIBLE)


@pytest.mark.parametrize("tier", INELIGIBLE, ids=lambda tier: tier.value)
def test_ineligible_tiers_produce_no_vector_and_no_row(
    tier: IndexTier,
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    out_dir: Path,
) -> None:
    """Tier 3, EXCLUDED_LICENSING and QUARANTINED_QUALITY: no vector, and no chunk_embedding row."""
    _, writer = _run(
        corpus_fixture,
        pinned_profile,
        runtime_pin_fixture,
        out_dir,
        tiers=[t.value for t in ELIGIBLE],
    )
    forbidden = {
        chunk_id for chunk_id, assigned in corpus_fixture.tier_by_chunk.items() if assigned is tier
    }
    assert forbidden, f"the fixture must contain a {tier.value} chunk for this test to mean anything"
    assert forbidden.isdisjoint(writer.keys)

    connection = open_corpus_database(corpus_fixture.path)
    try:
        embedded = {
            row[0] for row in connection.execute("SELECT search_chunk_id FROM chunk_embedding")
        }
    finally:
        connection.close()
    assert forbidden.isdisjoint(embedded)


def test_a_null_index_tier_fails_closed(corpus_fixture: CorpusFixture) -> None:
    """NULL means "the CRPS-04 pass has not run", not "ineligible" — so it must raise."""
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        connection.execute(
            "UPDATE search_chunk SET index_tier = NULL WHERE id = ?",
            (next(iter(sorted(corpus_fixture.tier_by_chunk))),),
        )
        with pytest.raises(UntieredChunk) as excinfo:
            select_chunks(connection, DEFAULT_TIERS())
    finally:
        connection.close()
    assert "index_tier IS NULL" in str(excinfo.value)


def test_select_chunks_refuses_an_ineligible_tier_even_when_called_directly(
    corpus_fixture: CorpusFixture,
) -> None:
    connection: sqlite3.Connection = open_corpus_database(corpus_fixture.path)
    try:
        with pytest.raises(IneligibleTierRequested):
            select_chunks(connection, [IndexTier.TIER_3_METADATA_AND_ON_DEMAND])
    finally:
        connection.close()


def test_counts_reconcile_with_the_row_count(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """Acceptance item 6: vector count == chunk_embedding rows, and considered == embedded+skipped."""
    result, writer = _run(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    connection = open_corpus_database(corpus_fixture.path)
    try:
        rows = connection.execute(
            "SELECT COUNT(*) FROM chunk_embedding WHERE profile_id = ?",
            (pinned_profile.profile.profile_id,),
        ).fetchone()[0]
    finally:
        connection.close()
    assert rows == result.embedded_count == len(writer.keys)
    assert result.chunk_count == result.embedded_count + result.skipped_count
    assert result.skipped_count == 0
