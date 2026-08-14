"""Resumability (CRPS-05 acceptance item 10, deliverable 5; test plan step 5).

The provider used here raises after N batches, which is the ticket's own construction. Three
properties are then asserted separately, because they fail separately:

* the union of the two runs equals the full run — including the VECTOR FILE, not only the
  `chunk_embedding` rows. An index that held only the second run's vectors while the database
  claimed the whole corpus would be a silent under-embed, the hardest failure here to detect after
  the fact;
* no chunk is embedded twice — asserted by counting what the provider was ASKED for, not by
  counting rows, since a duplicate row would raise on the primary key anyway;
* changing one chunk's `text_hash` causes exactly that chunk to be re-embedded.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Sequence

import pytest

from contracts.schema import open_corpus_database
from embedding_fixtures import CorpusFixture, RecordingWriter
from embeddings.build import build_embeddings, work_directory_for
from embeddings.emit import MANIFEST_FILENAME
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider, ProviderInfo, VectorBatch


class FailingAfterBatches:
    """A provider that records what it was asked for and gives up after *limit* batches."""

    def __init__(self, inner: DeterministicStubProvider, limit: int) -> None:
        self._inner = inner
        self._limit = limit
        self.batches = 0
        self.requested: list[str] = []

    def embed(self, texts: Sequence[str]) -> VectorBatch:
        if self.batches >= self._limit:
            raise RuntimeError("simulated interruption after N batches")
        self.batches += 1
        self.requested.extend(texts)
        return self._inner.embed(texts)

    def describe(self) -> ProviderInfo:
        return self._inner.describe()


def _stub(pinned: PinnedProfile) -> DeterministicStubProvider:
    return DeterministicStubProvider(
        seed=pinned.profile.seed, dimensions=pinned.profile.dimensions
    )


def _embedded_ids(corpus: CorpusFixture, profile_id: str) -> set[str]:
    connection = open_corpus_database(corpus.path)
    try:
        return {
            row[0]
            for row in connection.execute(
                "SELECT search_chunk_id FROM chunk_embedding WHERE profile_id = ?", (profile_id,)
            )
        }
    finally:
        connection.close()


def test_resume_embeds_exactly_the_missing_chunks(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    out = tmp_path / "out"
    profile_id = pinned_profile.profile.profile_id

    interrupted = FailingAfterBatches(_stub(pinned_profile), limit=1)
    with pytest.raises(RuntimeError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            interrupted,
            runtime_pin_fixture,
            out,
            writer=RecordingWriter(),
        )

    partial = _embedded_ids(corpus_fixture, profile_id)
    assert 0 < len(partial), "the interruption must land after at least one committed batch"
    # Nothing was published: steps 4-6 are all-or-nothing.
    assert not (out / MANIFEST_FILENAME).exists()
    assert not (out / "vectors.usearch").exists()

    resumed_provider = FailingAfterBatches(_stub(pinned_profile), limit=1000)
    writer = RecordingWriter()
    result = build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        resumed_provider,
        runtime_pin_fixture,
        out,
        resume=True,
        writer=writer,
    )

    full = _embedded_ids(corpus_fixture, profile_id)
    expected = set(corpus_fixture.eligible_chunk_ids([*result_tiers()]))
    assert full == expected
    assert result.resumed_from == len(partial)

    # No chunk was asked for twice: the resumed run re-embedded only what was missing.
    already_texts = {corpus_fixture.text_by_chunk[chunk_id] for chunk_id in partial}
    assert already_texts.isdisjoint(resumed_provider.requested)

    # The vector file holds EVERY selected chunk, not only the resumed run's share.
    assert set(writer.keys) == expected
    assert len(writer.keys) == len(expected)


def result_tiers():
    from tiering import IndexTier

    return (IndexTier.TIER_1_FULL_SEMANTIC,)


def test_the_resumed_index_matches_an_uninterrupted_one(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    """The whole point: an interruption must not change the artifact that is finally published."""
    resumed_out = tmp_path / "resumed"
    interrupted = FailingAfterBatches(_stub(pinned_profile), limit=1)
    with pytest.raises(RuntimeError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            interrupted,
            runtime_pin_fixture,
            resumed_out,
            writer=RecordingWriter(),
        )
    resumed_writer = RecordingWriter()
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        resumed_out,
        resume=True,
        writer=resumed_writer,
    )

    from embedding_fixtures import build_corpus

    clean_corpus = build_corpus(tmp_path / "clean" / "corpus.sqlite")
    clean_out = tmp_path / "clean-out"
    clean_writer = RecordingWriter()
    build_embeddings(
        clean_corpus.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        clean_out,
        writer=clean_writer,
    )

    assert resumed_writer.calls == clean_writer.calls
    assert (resumed_out / "vectors.usearch").read_bytes() == (
        clean_out / "vectors.usearch"
    ).read_bytes()

    left = json.loads((resumed_out / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    right = json.loads((clean_out / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    left.pop("built_at")
    right.pop("built_at")
    assert left == right


def test_a_changed_text_hash_re_embeds_exactly_that_chunk(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    out = tmp_path / "out"
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=RecordingWriter(),
    )

    # Re-point one chunk at a shorter span of the same node and update its `text_hash`, which is
    # what a re-chunk produces. `node_version` itself cannot be touched — it is one of the eight
    # immutable provenance tables (CRPS-01), which is a fact worth having a test encode.
    from contracts.validate import sha256_hex
    from tiering import IndexTier

    target = sorted(
        chunk_id
        for chunk_id, tier in corpus_fixture.tier_by_chunk.items()
        if tier is IndexTier.TIER_1_FULL_SEMANTIC
    )[0]
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        node_version_id, start, end = connection.execute(
            "SELECT node_version_id, start_offset, end_offset FROM search_chunk WHERE id = ?",
            (target,),
        ).fetchone()
        canonical = connection.execute(
            "SELECT canonical_text FROM node_version WHERE id = ?", (node_version_id,)
        ).fetchone()[0]
        new_end = end - 5
        expected_text = canonical[start:new_end]
        connection.execute(
            "UPDATE search_chunk SET end_offset = ?, text_hash = ? WHERE id = ?",
            (new_end, sha256_hex(expected_text), target),
        )
    finally:
        connection.close()

    provider = FailingAfterBatches(_stub(pinned_profile), limit=1000)
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        provider,
        runtime_pin_fixture,
        out,
        resume=True,
        writer=RecordingWriter(),
    )
    assert provider.requested == [expected_text]


def test_resume_without_state_re_embeds_rather_than_trusting_the_rows(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    """A row with no state entry is redone: `chunk_embedding` has no column to carry the hash.

    That is the conservative direction, and it is the only one available — trusting a row whose
    provenance is unrecorded is what would silently under-embed a release.
    """
    out = tmp_path / "out"
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=RecordingWriter(),
    )
    # Discard the state the way an operator who deleted the scratch directory would.
    shutil.rmtree(work_directory_for(out))

    provider = FailingAfterBatches(_stub(pinned_profile), limit=1000)
    writer = RecordingWriter()
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        provider,
        runtime_pin_fixture,
        out,
        resume=True,
        writer=writer,
    )
    expected = corpus_fixture.eligible_chunk_ids(result_tiers())
    assert tuple(sorted(writer.keys)) == expected
    assert len(provider.requested) == len(expected)
