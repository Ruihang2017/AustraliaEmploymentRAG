"""The `search_chunk_id` <-> USearch key mapping, as the read side must reconstruct it.

USearch keys are `uint64`; `chunk_embedding.vector_key` is the `search_chunk_id` STRING, exactly as
deliverable 3 step 4 specifies (`vector_key = f"{search_chunk_id}"`). The two are therefore not the
same value, and `RETR-05` — which is `blocked_by` this ticket — cannot turn a search result's key
back into a chunk by looking the key up in the `vector_key` column.

What it CAN do, and what this module pins down so a later edit cannot quietly break it, is:

    the USearch key of a vector is its POSITION in the build's canonical order, and that order is
    `(search_chunk.node_version_id, search_chunk.chunk_ordinal)` over the rows of
    `chunk_embedding` for the profile — all of it recoverable from `corpus.sqlite` alone.

Positional keys rather than a hash of the id is a deliberate choice (see `vectors.py`): a 64-bit
hash of a UUID-shaped id collides eventually and silently drops a vector, and the count check can
still pass when two collide and one is skipped.

This is the plan's open question Q7, raised for `RETR-05` and `CRPS-02` rather than settled here:
widening `embedding-manifest.schema.json` to carry the mapping is `CRPS-02`'s file-scope, and
nothing in this ticket may invent a member for it. The test below is the contract `RETR-05` should
be checked against before it starts; if it proves insufficient, the fix is a ticket change, not a
local widening.
"""

from __future__ import annotations

from pathlib import Path

from contracts.schema import open_corpus_database
from embedding_fixtures import CorpusFixture, RecordingWriter
from embeddings.build import build_embeddings, vector_key_for
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider


def _stub(pinned: PinnedProfile) -> DeterministicStubProvider:
    return DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions)


def test_the_vector_key_column_holds_the_search_chunk_id_verbatim(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        tmp_path / "out",
        writer=RecordingWriter(),
    )
    connection = open_corpus_database(corpus_fixture.path)
    try:
        rows = connection.execute(
            "SELECT search_chunk_id, vector_key FROM chunk_embedding WHERE profile_id = ?",
            (pinned_profile.profile.profile_id,),
        ).fetchall()
    finally:
        connection.close()

    assert rows
    for search_chunk_id, vector_key in rows:
        assert vector_key == vector_key_for(search_chunk_id) == f"{search_chunk_id}"


def test_the_usearch_key_of_a_row_is_recoverable_from_the_database_alone(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    """Reconstruct the position -> `search_chunk_id` map the way `RETR-05` will have to.

    The query below is the whole read-side recipe: join `chunk_embedding` to `search_chunk`, order
    by the canonical key, and the row's index IS the USearch key. It must agree with the order the
    writer was actually fed.
    """
    writer = RecordingWriter()
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        tmp_path / "out",
        writer=writer,
    )

    connection = open_corpus_database(corpus_fixture.path)
    try:
        rows = connection.execute(
            "SELECT ce.vector_key, sc.node_version_id, sc.chunk_ordinal"
            " FROM chunk_embedding ce JOIN search_chunk sc ON sc.id = ce.search_chunk_id"
            " WHERE ce.profile_id = ?",
            (pinned_profile.profile.profile_id,),
        ).fetchall()
    finally:
        connection.close()

    # Sorted in Python on the explicit canonical key, exactly as `selection.select_chunks` does —
    # the on-disk order of a signed artifact is never delegated to the database's iteration order.
    recovered = tuple(
        vector_key
        for vector_key, _, _ in sorted(rows, key=lambda row: (row[1], row[2]))
    )
    assert recovered == writer.keys
    assert len(set(recovered)) == len(recovered), "a duplicate key would silently drop a vector"
