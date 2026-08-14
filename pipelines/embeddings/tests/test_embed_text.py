"""What actually gets embedded: character-offset slicing, verified against `text_hash`.

`search_chunk` stores OFFSETS, not text. Getting this wrong puts plausible but wrong vectors into a
signed release, invisibly — there is no downstream check that would notice. So:

* the slice is taken on the Python `str`, with half-open CHARACTER offsets (CRPS-03), never with
  SQL `substr`, which is 1-based and whose unit differs by build;
* every slice is hashed and compared with `search_chunk.text_hash` before it is embedded;
* a consolidated chunk is embedded as its ANCHOR SPAN. CRPS-03 keeps a consolidated chunk's offsets
  and hash on the first participant and carries the group in
  `SearchChunkDraft.consolidated_node_version_ids`, a field with no `search_chunk` column — so the
  group cannot be reconstructed from the corpus database, and the hash check forces the anchor span
  in any case. Recorded as a writeback against CRPS-03/CRPS-06, not solved here.

The fixture's non-ASCII node carries combining marks and a non-BMP character, so the difference
between character offsets and byte or UTF-16 offsets is genuinely load-bearing here rather than
theoretical.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from contracts.schema import open_corpus_database
from contracts.validate import sha256_hex
from embedding_fixtures import CorpusFixture, RecordingWriter, search_chunk_id
from embeddings.build import build_embeddings
from embeddings.errors import ChunkTextMismatch
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider, ProviderInfo, VectorBatch
from embeddings.selection import DEFAULT_TIERS, iter_chunk_texts, select_chunks


class CapturingProvider:
    """Records the exact strings the build handed it."""

    def __init__(self, inner: DeterministicStubProvider) -> None:
        self._inner = inner
        self.texts: list[str] = []

    def embed(self, texts) -> VectorBatch:
        self.texts.extend(texts)
        return self._inner.embed(texts)

    def describe(self) -> ProviderInfo:
        return self._inner.describe()


def _capture(
    corpus: CorpusFixture, pinned: PinnedProfile, runtime, out: Path, tiers=None
) -> tuple[CapturingProvider, RecordingWriter]:
    provider = CapturingProvider(
        DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions)
    )
    writer = RecordingWriter()
    build_embeddings(corpus.path, pinned, provider, runtime, out, tiers=tiers, writer=writer)
    return provider, writer


def _a_selected_chunk(corpus: CorpusFixture) -> str:
    """A chunk the DEFAULT selection actually includes — not merely the first id alphabetically."""
    selected = corpus.eligible_chunk_ids(DEFAULT_TIERS())
    assert selected
    return selected[0]


def test_the_embedded_text_is_the_recorded_chunk_span(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    provider, writer = _capture(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    expected = [corpus_fixture.text_by_chunk[key] for key in writer.keys]
    assert provider.texts == expected


def test_a_non_ascii_chunk_is_sliced_by_character_not_by_byte(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    provider, _ = _capture(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    non_ascii = [text for text in provider.texts if any(ord(ch) > 127 for ch in text)]
    assert non_ascii, "the fixture must contain a non-ASCII chunk for this test to mean anything"
    # A non-BMP character survives intact — byte or UTF-16 offsets would have split it.
    assert any("\U0001d54f" in text for text in provider.texts)
    for text in non_ascii:
        assert sha256_hex(text) in {
            chunk_hash
            for chunk_hash in (
                sha256_hex(value) for value in corpus_fixture.text_by_chunk.values()
            )
        }


def test_two_chunks_with_identical_text_get_identical_vectors_but_distinct_keys(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """The fixture reuses one paragraph across several nodes, so this is a real case here.

    Both dense-eligible tiers are requested, because the duplicated paragraph spans a Tier 1 and a
    Tier 2 node.
    """
    from tiering import IndexTier

    _, writer = _capture(
        corpus_fixture,
        pinned_profile,
        runtime_pin_fixture,
        out_dir,
        tiers=[IndexTier.TIER_1_FULL_SEMANTIC.value, IndexTier.TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC.value],
    )
    by_text: dict[str, list[str]] = {}
    for key, vector in writer.calls:
        by_text.setdefault(corpus_fixture.text_by_chunk[key], []).append(key)
    shared = [keys for keys in by_text.values() if len(keys) > 1]
    assert shared, "the fixture must contain two chunks with identical text"

    vectors = dict(writer.calls)
    for keys in shared:
        assert len(set(keys)) == len(keys)  # distinct vector_keys
        assert len({vectors[key] for key in keys}) == 1  # identical vectors

    connection = open_corpus_database(corpus_fixture.path)
    try:
        rows = connection.execute(
            "SELECT search_chunk_id, vector_key FROM chunk_embedding"
        ).fetchall()
    finally:
        connection.close()
    assert {chunk_id for chunk_id, _ in rows} == set(writer.keys)
    assert all(chunk_id == vector_key for chunk_id, vector_key in rows)


def test_a_consolidated_chunk_is_embedded_as_its_anchor_span(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """No sibling text is joined; the second participant emits no chunk at all."""
    anchor = search_chunk_id("nv_short_a", 0)
    assert anchor in corpus_fixture.tier_by_chunk
    assert search_chunk_id("nv_short_b", 0) not in corpus_fixture.tier_by_chunk

    provider, _ = _capture(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    embedded = corpus_fixture.text_by_chunk[anchor]
    assert embedded in provider.texts
    assert "Definitions apply." not in embedded


def test_a_tampered_text_hash_is_blocking(corpus_fixture: CorpusFixture) -> None:
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        target = _a_selected_chunk(corpus_fixture)
        connection.execute("UPDATE search_chunk SET text_hash = ? WHERE id = ?", ("f" * 64, target))
        chunks = select_chunks(connection, DEFAULT_TIERS())
        with pytest.raises(ChunkTextMismatch) as excinfo:
            list(iter_chunk_texts(connection, chunks, 4))
    finally:
        connection.close()
    assert "f" * 64 in str(excinfo.value)


def test_a_missing_node_version_is_blocking(corpus_fixture: CorpusFixture) -> None:
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        chunks = select_chunks(connection, DEFAULT_TIERS())
        # `node_version` is immutable and foreign keys are ON, so the row cannot be removed;
        # constructing the dangling reference directly is what exercises the branch.
        dangling = [type(chunks[0])(**{**chunks[0].__dict__, "node_version_id": "nv_absent"})]
        with pytest.raises(ChunkTextMismatch) as excinfo:
            list(iter_chunk_texts(connection, dangling, 4))
    finally:
        connection.close()
    assert "nv_absent" in str(excinfo.value)


def test_an_empty_span_is_handled_explicitly(corpus_fixture: CorpusFixture) -> None:
    """`start_offset == end_offset` is representable (the DDL allows it) and must not crash."""
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        target = _a_selected_chunk(corpus_fixture)
        connection.execute(
            "UPDATE search_chunk SET start_offset = 0, end_offset = 0, text_hash = ? WHERE id = ?",
            (sha256_hex(""), target),
        )
        chunks = select_chunks(connection, DEFAULT_TIERS())
        batches = list(iter_chunk_texts(connection, chunks, 100))
    finally:
        connection.close()
    texts = {chunk.search_chunk_id: text for batch in batches for chunk, text in batch}
    assert texts[target] == ""


def test_batching_covers_every_chunk_exactly_once(corpus_fixture: CorpusFixture) -> None:
    connection = open_corpus_database(corpus_fixture.path)
    try:
        chunks = select_chunks(connection, DEFAULT_TIERS())
        for batch_size in (1, 2, 3, len(chunks), len(chunks) + 10):
            batches = list(iter_chunk_texts(connection, chunks, batch_size))
            assert all(len(batch) <= batch_size for batch in batches)
            seen = [chunk.search_chunk_id for batch in batches for chunk, _ in batch]
            assert seen == [chunk.search_chunk_id for chunk in chunks]
    finally:
        connection.close()
