"""A failed run leaves no partial artifact (CRPS-05 acceptance item 11; test plan step 10).

Failures are injected at each of steps 4, 5 and 6 separately — the writer, the database and the
manifest — because "all-or-nothing" that only holds for one of them is not all-or-nothing.

Also asserted: the output directory contains PRD §18.4's names and nothing else. The build's
scratch space is a SIBLING of the bundle root precisely so that CRPS-02's `verify_bundle` cannot
report it as `BUNDLE_FILE_UNLISTED`, and a test is the only thing that keeps that true.
"""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import pytest

from embedding_fixtures import CorpusFixture, RecordingWriter
from embeddings.build import build_embeddings, work_directory_for
from embeddings.emit import MANIFEST_FILENAME, VECTOR_FILENAME
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider, ProviderInfo, VectorBatch
from embeddings.report import REPORT_FILENAME
from embeddings.vectors import VectorFileStat

PUBLISHED = (MANIFEST_FILENAME, VECTOR_FILENAME, REPORT_FILENAME)


class ExplodingProvider:
    """Fails during step 3/5, after at least one batch has been committed."""

    def __init__(self, inner: DeterministicStubProvider) -> None:
        self._inner = inner
        self._calls = 0

    def embed(self, texts: Sequence[str]) -> VectorBatch:
        self._calls += 1
        if self._calls > 1:
            raise RuntimeError("boom during embedding")
        return self._inner.embed(texts)

    def describe(self) -> ProviderInfo:
        return self._inner.describe()


class ExplodingWriter(RecordingWriter):
    """Fails during step 4, at `finalise` — after every vector has been accepted."""

    def finalise(self, path: Path) -> VectorFileStat:
        raise RuntimeError("boom while writing the vector file")


class MiscountingWriter(RecordingWriter):
    """Reports a count that disagrees with `chunk_embedding`; step 6 must refuse to describe it."""

    def finalise(self, path: Path) -> VectorFileStat:
        stat = super().finalise(path)
        return VectorFileStat(sha256=stat.sha256, byte_size=stat.byte_size, count=stat.count + 1)


def _stub(pinned: PinnedProfile) -> DeterministicStubProvider:
    return DeterministicStubProvider(
        seed=pinned.profile.seed, dimensions=pinned.profile.dimensions
    )


def _assert_nothing_published(out: Path) -> None:
    for name in PUBLISHED:
        assert not (out / name).exists(), f"{name} was published by a failed run"
    if out.exists():
        assert sorted(entry.name for entry in out.iterdir()) == []


@pytest.mark.parametrize(
    ("label", "provider_factory", "writer_factory"),
    [
        ("step 3/5 — the provider fails mid-run", ExplodingProvider, RecordingWriter),
        ("step 4 — the vector file cannot be written", None, ExplodingWriter),
        ("step 6 — the counts disagree with the database", None, MiscountingWriter),
    ],
)
def test_a_failed_run_publishes_nothing(
    label: str,
    provider_factory,
    writer_factory,
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    runtime_pin_fixture,
    tmp_path: Path,
) -> None:
    out = tmp_path / "out"
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

    _assert_nothing_published(out)


def test_a_failed_run_leaves_its_scratch_outside_the_bundle(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    """The work directory must never be mistaken for output, nor sit inside the bundle root."""
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
    work = work_directory_for(out)
    assert work.exists()
    assert work.parent == out.parent and work != out
    assert out not in work.parents


def test_a_successful_run_publishes_exactly_the_three_names(
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
    assert sorted(entry.name for entry in out.iterdir()) == sorted(PUBLISHED)
    # No `.partial` leftovers from either atomic write.
    assert not list(out.glob("*.partial"))


def test_an_empty_selection_still_produces_a_valid_manifest(
    tmp_path: Path, pinned_profile: PinnedProfile, runtime_pin_fixture
) -> None:
    """No eligible chunks: `embedded_count = 0`, `vector_file.count = 0`, and no crash.

    `dimensions` must still be >= 1 — the schema requires it, and a zero would make the manifest
    describe an index nothing could ever query.
    """
    from embedding_fixtures import NODE_SPECS, build_corpus

    ineligible = tuple(
        spec for spec in NODE_SPECS if spec.source_initial_tier == "T3" or spec.quarantine_open
    )
    assert ineligible
    corpus = build_corpus(tmp_path / "empty" / "corpus.sqlite", specs=ineligible)

    out = tmp_path / "out"
    result = build_embeddings(
        corpus.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=RecordingWriter(),
    )
    assert result.embedded_count == 0
    assert result.chunk_count == 0

    import json

    document = json.loads((out / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    assert document["vector_file"]["count"] == 0
    assert document["tier_selection"]["embedded_count"] == 0
    assert document["tier_selection"]["skipped_count"] == 0
    assert document["dimensions"] >= 1


def test_the_build_report_is_published_with_its_measurements(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    import json

    out = tmp_path / "out"
    result = build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        _stub(pinned_profile),
        runtime_pin_fixture,
        out,
        writer=RecordingWriter(),
    )
    document = json.loads((out / REPORT_FILENAME).read_text(encoding="utf-8"))
    assert document["embedded_count"] == result.embedded_count
    assert document["peak_rss_bytes"] > 0
    assert document["peak_rss_source"] == result.peak_rss_source
    assert document["profile_fingerprint"] == result.profile_fingerprint
    assert document["resumed_from"] is None
    # These live here and NOT in the manifest: its schema is additionalProperties: false.
    manifest = json.loads((out / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    for measurement in ("peak_rss_bytes", "resumed_from", "profile_fingerprint", "elapsed_seconds"):
        assert measurement not in manifest
