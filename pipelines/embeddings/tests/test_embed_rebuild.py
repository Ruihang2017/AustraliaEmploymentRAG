"""A failed REBUILD leaves the previously published index exactly as it found it.

`test_embed_atomicity.py` covers the FIRST build: a failure publishes nothing, because there was
nothing there to begin with. This module covers the case that follows it in real use — a rebuild of
a profile that has already been published — where "nothing was published" is not enough. Three
distinct states have to survive a failed rebuild together, or acceptance item 6's count invariant
and deliverable 3's all-or-nothing are broken for every run after the first:

* the `chunk_embedding` rows for the profile;
* the published `vectors.usearch`, `embedding-manifest.json` and `embedding-build-report.json`;
* the resume state, without which the next `resume=True` cannot finish the interrupted work.

Also covered here, because it is the same publication step:

* publication is ONE group — a failure between the individual `os.replace` calls must not leave a
  new vector file beside a stale or missing manifest (the two artifacts PRD §18.4 ships together);
* the PRD §14.4 dual-index guard is re-run under the publication lock, so a second profile that
  appears AFTER the up-front check still cannot end up sharing one index.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Sequence

import pytest

from contracts.schema import open_corpus_database
from embedding_fixtures import CorpusFixture, RecordingWriter
from embeddings.build import (
    build_embeddings,
    journal_directory_for,
    work_directory_for,
)
from embeddings.emit import MANIFEST_FILENAME, VECTOR_FILENAME
from embeddings.errors import ProfileMismatch
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider, ProviderInfo, VectorBatch
from embeddings.report import REPORT_FILENAME
from embeddings.vectors import VectorFileStat

PUBLISHED = (VECTOR_FILENAME, MANIFEST_FILENAME, REPORT_FILENAME)


# --------------------------------------------------------------------------------------------------
# Failure injectors
# --------------------------------------------------------------------------------------------------


class ExplodingProvider:
    """Fails during step 3/5, after at least one batch of the REBUILD has been committed."""

    def __init__(self, inner: DeterministicStubProvider) -> None:
        self._inner = inner
        self._calls = 0

    def embed(self, texts: Sequence[str]) -> VectorBatch:
        self._calls += 1
        if self._calls > 1:
            raise RuntimeError("boom during the rebuild's embedding")
        return self._inner.embed(texts)

    def describe(self) -> ProviderInfo:
        return self._inner.describe()


class ExplodingWriter(RecordingWriter):
    """Fails during step 4, at `finalise` — after every vector has been accepted."""

    def finalise(self, path: Path) -> VectorFileStat:
        raise RuntimeError("boom while writing the rebuilt vector file")


class MiscountingWriter(RecordingWriter):
    """Reports a count that disagrees with `chunk_embedding`; publication must refuse."""

    def finalise(self, path: Path) -> VectorFileStat:
        stat = super().finalise(path)
        return VectorFileStat(sha256=stat.sha256, byte_size=stat.byte_size, count=stat.count + 1)


class ForeignProfileWriter(RecordingWriter):
    """Commits a row for ANOTHER profile between the up-front guard and publication.

    This is the concurrency shape the reviewer asked about: two builds that both pass
    `assert_profile_compatible` and then both publish would produce one mixed index, which PRD §14.4
    forbids. A separate connection is used deliberately — that is what a second operator's build
    would be.
    """

    def __init__(self, corpus_path: Path, foreign_profile_id: str) -> None:
        super().__init__()
        self._corpus_path = corpus_path
        self._foreign_profile_id = foreign_profile_id

    def finalise(self, path: Path) -> VectorFileStat:
        stat = super().finalise(path)
        connection = open_corpus_database(self._corpus_path, read_only=False)
        try:
            chunk_id = connection.execute(
                "SELECT id FROM search_chunk ORDER BY id LIMIT 1"
            ).fetchone()[0]
            connection.execute(
                "INSERT INTO chunk_embedding (search_chunk_id, profile_id, vector_key, dimensions,"
                " quantisation) VALUES (?, ?, ?, ?, ?)",
                (chunk_id, self._foreign_profile_id, chunk_id, 8, "none"),
            )
        finally:
            connection.close()
        return stat


class OneShotReplaceFailure:
    """Fail `os.replace` exactly once, for one destination name inside the output directory.

    One-shot on purpose: the rollback restores displaced files with `os.replace` too, and a fake
    that kept failing would be testing the fake rather than the rollback. A transient disk or
    anti-virus error is also the realistic shape of this failure.
    """

    def __init__(self, out_dir: Path, filename: str) -> None:
        self._out_dir = out_dir
        self._filename = filename
        self._real = os.replace
        self.fired = False

    def __call__(self, src, dst, **kwargs):  # type: ignore[no-untyped-def]
        destination = Path(dst)
        if (
            not self.fired
            and destination.name == self._filename
            and destination.parent == self._out_dir
        ):
            self.fired = True
            raise OSError(28, "no space left on device (injected)")
        return self._real(src, dst, **kwargs)


# --------------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------------


def _stub(pinned: PinnedProfile) -> DeterministicStubProvider:
    return DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions)


def _rows(corpus_path: Path, profile_id: str) -> set[tuple[str, str, str, int, str]]:
    connection = open_corpus_database(corpus_path)
    try:
        return {
            (str(r[0]), str(r[1]), str(r[2]), int(r[3]), str(r[4]))
            for r in connection.execute(
                "SELECT search_chunk_id, profile_id, vector_key, dimensions, quantisation"
                " FROM chunk_embedding WHERE profile_id = ?",
                (profile_id,),
            )
        }
    finally:
        connection.close()


def _make_the_rebuild_differ(corpus_path: Path) -> None:
    """Re-point one chunk at a shorter span of the same node, as a re-chunk would.

    Without this the rebuild of an unchanged corpus is byte-identical to what is already published,
    and "the previous file was restored" is indistinguishable from "the new file was published" —
    the assertion would hold no matter what the code did. `node_version` itself cannot be touched:
    it is one of CRPS-01's eight immutable provenance tables.
    """
    from contracts.validate import sha256_hex

    connection = open_corpus_database(corpus_path, read_only=False)
    try:
        target, node_version_id, start, end = connection.execute(
            "SELECT id, node_version_id, start_offset, end_offset FROM search_chunk"
            " WHERE index_tier = 'TIER_1_FULL_SEMANTIC' ORDER BY id LIMIT 1"
        ).fetchone()
        canonical = connection.execute(
            "SELECT canonical_text FROM node_version WHERE id = ?", (node_version_id,)
        ).fetchone()[0]
        new_end = end - 5
        connection.execute(
            "UPDATE search_chunk SET end_offset = ?, text_hash = ? WHERE id = ?",
            (new_end, sha256_hex(canonical[start:new_end]), target),
        )
    finally:
        connection.close()


def _published_bytes(out: Path) -> dict[str, bytes]:
    return {name: (out / name).read_bytes() for name in PUBLISHED if (out / name).exists()}


def _first_build(
    corpus: CorpusFixture, pinned: PinnedProfile, runtime, out: Path
) -> tuple[set[tuple[str, str, str, int, str]], dict[str, bytes]]:
    build_embeddings(corpus.path, pinned, _stub(pinned), runtime, out, writer=RecordingWriter())
    rows = _rows(corpus.path, pinned.profile.profile_id)
    assert rows, "the first build must publish some rows for the rebuild cases to mean anything"
    return rows, _published_bytes(out)


# --------------------------------------------------------------------------------------------------
# Finding 1 — a failed rebuild must not have destroyed the previous index
# --------------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("label", "provider_factory", "writer_factory"),
    [
        ("the provider fails mid-rebuild", ExplodingProvider, RecordingWriter),
        ("the vector file cannot be written", None, ExplodingWriter),
        ("the counts disagree with the database", None, MiscountingWriter),
    ],
)
def test_a_failed_rebuild_leaves_the_previous_index_untouched(
    label: str,
    provider_factory,
    writer_factory,
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    out = tmp_path / "out"
    profile_id = pinned_profile.profile.profile_id
    rows_before, files_before = _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out)
    state_before = (work_directory_for(out) / "resume-state.json").read_bytes()
    # The rebuild must genuinely differ from what is published, or a rebuild that destroyed the
    # previous state would still satisfy the assertions below by accident.
    _make_the_rebuild_differ(corpus_fixture.path)

    inner = _stub(pinned_profile)
    provider = provider_factory(inner) if provider_factory is not None else inner
    with pytest.raises((RuntimeError, ValueError)):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            provider,
            runtime_pin_fixture,
            out,
            writer=writer_factory(),
        )

    assert _rows(corpus_fixture.path, profile_id) == rows_before, (
        "the rebuild deleted the previous profile's rows and did not put them back; the published "
        "manifest now describes a row set the database no longer holds"
    )
    assert _published_bytes(out) == files_before
    assert (work_directory_for(out) / "resume-state.json").read_bytes() == state_before
    assert not journal_directory_for(out).exists(), "the rollback journal outlived its rollback"


def test_the_previous_index_stays_usable_after_a_failed_rebuild(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    """A restored index is not merely present, it is complete: the next rebuild succeeds from it."""
    out = tmp_path / "out"
    rows_before, files_before = _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out)

    with pytest.raises(RuntimeError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            ExplodingProvider(_stub(pinned_profile)),
            runtime_pin_fixture,
            out,
            writer=RecordingWriter(),
        )

    writer = RecordingWriter()
    result = build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=writer,
    )
    assert result.embedded_count == len(rows_before)
    assert _rows(corpus_fixture.path, pinned_profile.profile.profile_id) == rows_before
    # Byte-identical to the first build: a rebuild of unchanged input is the determinism criterion.
    rebuilt = _published_bytes(out)
    assert rebuilt[VECTOR_FILENAME] == files_before[VECTOR_FILENAME]
    before = json.loads(files_before[MANIFEST_FILENAME].decode("utf-8"))
    after = json.loads(rebuilt[MANIFEST_FILENAME].decode("utf-8"))
    assert after.pop("built_at") and before.pop("built_at")
    assert after == before
    assert not journal_directory_for(out).exists()


def test_a_successful_rebuild_discards_its_journal_and_its_backups(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    out = tmp_path / "out"
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out)
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=RecordingWriter(),
    )
    assert not journal_directory_for(out).exists()
    assert not (work_directory_for(out) / "publication-backup").exists()
    # The bundle root still holds PRD §18.4's three names and nothing else.
    assert sorted(entry.name for entry in out.iterdir()) == sorted(PUBLISHED)


def test_a_first_build_that_fails_keeps_its_partial_rows_for_resume(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    """The journal must NOT arm when there is nothing to lose.

    Rolling an empty snapshot back over a first build's partially committed rows would turn an
    interruption into lost work — the exact opposite of deliverable 5.
    """
    out = tmp_path / "out"
    with pytest.raises(RuntimeError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            ExplodingProvider(_stub(pinned_profile)),
            runtime_pin_fixture,
            out,
            writer=RecordingWriter(),
        )
    assert _rows(corpus_fixture.path, pinned_profile.profile.profile_id)
    assert not journal_directory_for(out).exists()


# --------------------------------------------------------------------------------------------------
# Finding 2 — publication is one group
# --------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("failing_name", PUBLISHED)
def test_a_publication_failure_publishes_none_of_the_group_on_a_first_build(
    failing_name: str,
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    out = tmp_path / "out"
    failure = OneShotReplaceFailure(out, failing_name)
    monkeypatch.setattr(os, "replace", failure)

    with pytest.raises(OSError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            _stub(pinned_profile),
            runtime_pin_fixture,
            out,
            writer=RecordingWriter(),
        )
    assert failure.fired
    published = [entry.name for entry in out.iterdir()] if out.exists() else []
    assert published == [], (
        f"publication failed at {failing_name} but left {published} behind; a vector file without "
        "its manifest is the one state PRD §18.4's bundle must never be in"
    )


@pytest.mark.parametrize("failing_name", PUBLISHED)
def test_a_publication_failure_restores_the_previous_group_on_a_rebuild(
    failing_name: str,
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    out = tmp_path / "out"
    rows_before, files_before = _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out)
    # The rebuild must produce DIFFERENT bytes, or "restored" and "published" look the same.
    _make_the_rebuild_differ(corpus_fixture.path)

    failure = OneShotReplaceFailure(out, failing_name)
    monkeypatch.setattr(os, "replace", failure)
    with pytest.raises(OSError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            _stub(pinned_profile),
            runtime_pin_fixture,
            out,
            writer=RecordingWriter(),
        )
    assert failure.fired
    assert _published_bytes(out) == files_before
    assert sorted(entry.name for entry in out.iterdir()) == sorted(PUBLISHED)
    assert _rows(corpus_fixture.path, pinned_profile.profile.profile_id) == rows_before


# --------------------------------------------------------------------------------------------------
# Finding 4 — the dual-index guard is re-checked under the publication lock
# --------------------------------------------------------------------------------------------------


def test_a_second_profile_appearing_after_the_guard_still_cannot_publish(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    out = tmp_path / "out"
    writer = ForeignProfileWriter(corpus_fixture.path, foreign_profile_id="embed-other-v9")

    with pytest.raises(ProfileMismatch) as raised:
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            _stub(pinned_profile),
            runtime_pin_fixture,
            out,
            writer=writer,
        )
    assert "embed-other-v9" in str(raised.value)
    assert not out.exists() or sorted(entry.name for entry in out.iterdir()) == []


def test_the_publication_transaction_is_immediate(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    """A deferred BEGIN would take no lock until its first write, and publication writes no row.

    So the lock that serialises two builds' publications has to be taken by `BEGIN IMMEDIATE`
    itself. Asserted by watching the statements the connection executes rather than by inspecting
    source text: what matters is the statement that actually runs.
    """
    statements: list[str] = []

    class WatchedConnection(sqlite3.Connection):
        def execute(self, sql, *args):  # type: ignore[override, no-untyped-def]
            statements.append(sql)
            return super().execute(sql, *args)

    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    connection.close()
    connection = sqlite3.connect(
        corpus_fixture.path, isolation_level=None, factory=WatchedConnection
    )
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            _stub(pinned_profile),
            runtime_pin_fixture,
            tmp_path / "out",
            writer=RecordingWriter(),
            connection=connection,
        )
    finally:
        connection.close()

    assert "BEGIN IMMEDIATE" in statements
