"""The profile-compatibility guard (CRPS-05 acceptance item 8; test plan step 6).

Four situations, FOUR DISTINCT EXCEPTION TYPES. `pytest.raises` is given the specific type in each
case, so an implementation that collapsed them into one error with four messages would fail here —
which is the point: PRD §14.4's "dual index" rule is a caller that must tell them apart.
"""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from contracts.schema import open_corpus_database
from embedding_fixtures import CorpusFixture, RecordingWriter, make_profile
from embeddings.build import build_embeddings
from embeddings.emit import MANIFEST_FILENAME
from embeddings.errors import (
    ModelArtefactMismatch,
    ProfileMismatch,
    RuntimeMismatch,
    TokenizerArtefactMismatch,
)
from embeddings.guard import assert_profile_compatible
from embeddings.profile import PinnedProfile, resolve_effective_profile
from embeddings.provider import DeterministicStubProvider


def _first_build(
    corpus: CorpusFixture, pinned: PinnedProfile, runtime, out: Path
) -> None:
    build_embeddings(
        corpus.path,
        pinned,
        DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions),
        runtime,
        out,
        writer=RecordingWriter(),
    )


def _effective(pinned: PinnedProfile):
    provider = DeterministicStubProvider(
        seed=pinned.profile.seed, dimensions=pinned.profile.dimensions
    )
    return resolve_effective_profile(pinned.profile, provider.describe()), provider.describe()


def test_a_second_profile_is_refused(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)

    other = replace(pinned_profile, profile=make_profile(profile_id="embed-fixture-v2", dimensions=16))
    with pytest.raises(ProfileMismatch):
        build_embeddings(
            corpus_fixture.path,
            other,
            DeterministicStubProvider(seed=other.profile.seed, dimensions=other.profile.dimensions),
            runtime_pin_fixture,
            out_dir / "second",
            writer=RecordingWriter(),
        )


def test_a_different_model_artefact_is_refused(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    profile, _ = _effective(pinned_profile)
    connection = open_corpus_database(corpus_fixture.path)
    try:
        with pytest.raises(ModelArtefactMismatch):
            assert_profile_compatible(
                connection,
                profile,
                manifest_path=out_dir / MANIFEST_FILENAME,
                model_artefact_sha256="e" * 64,
            )
    finally:
        connection.close()


def test_a_different_tokenizer_artefact_is_refused(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    profile, info = _effective(pinned_profile)
    connection = open_corpus_database(corpus_fixture.path)
    try:
        with pytest.raises(TokenizerArtefactMismatch):
            assert_profile_compatible(
                connection,
                profile,
                manifest_path=out_dir / MANIFEST_FILENAME,
                model_artefact_sha256=info.model_artefact.sha256,
                tokenizer_artifact_sha256="d" * 64,
            )
    finally:
        connection.close()


def test_a_different_runtime_is_refused(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    profile, info = _effective(pinned_profile)
    other_runtime = replace(runtime_pin_fixture, family="stub:some-other-runtime", version="9.9.9")
    connection = open_corpus_database(corpus_fixture.path)
    try:
        with pytest.raises(RuntimeMismatch):
            assert_profile_compatible(
                connection,
                profile,
                manifest_path=out_dir / MANIFEST_FILENAME,
                model_artefact_sha256=info.model_artefact.sha256,
                tokenizer_artifact_sha256=info.tokenizer_artifact_sha256,
                runtime=other_runtime,
            )
    finally:
        connection.close()


def test_the_matching_build_is_allowed_through(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """A guard that refused everything would pass all four tests above and be useless."""
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    profile, info = _effective(pinned_profile)
    from embeddings.emit import stub_marked_runtime

    connection = open_corpus_database(corpus_fixture.path)
    try:
        assert_profile_compatible(
            connection,
            profile,
            manifest_path=out_dir / MANIFEST_FILENAME,
            model_artefact_sha256=info.model_artefact.sha256,
            tokenizer_artifact_sha256=info.tokenizer_artifact_sha256,
            runtime=stub_marked_runtime(runtime_pin_fixture, info),
        )
    finally:
        connection.close()


def test_rows_for_another_profile_in_the_same_corpus_are_refused(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile
) -> None:
    """PRD §14.4: two profiles mean two indexes, never one mixed index."""
    connection = open_corpus_database(corpus_fixture.path, read_only=False)
    try:
        chunk_id = sorted(corpus_fixture.tier_by_chunk)[0]
        connection.execute(
            "INSERT INTO chunk_embedding (search_chunk_id, profile_id, vector_key, dimensions,"
            " quantisation) VALUES (?, 'some-other-profile', ?, 8, 'none')",
            (chunk_id, chunk_id),
        )
        profile, _ = _effective(pinned_profile)
        with pytest.raises(ProfileMismatch) as excinfo:
            assert_profile_compatible(connection, profile)
    finally:
        connection.close()
    assert "some-other-profile" in str(excinfo.value)


def test_no_manifest_yet_is_not_a_mismatch(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, out_dir: Path
) -> None:
    """A first build has nothing to compare against and must not be blocked."""
    profile, _ = _effective(pinned_profile)
    connection = open_corpus_database(corpus_fixture.path)
    try:
        assert_profile_compatible(connection, profile, manifest_path=out_dir / MANIFEST_FILENAME)
    finally:
        connection.close()


def test_a_rebuild_with_the_same_profile_is_allowed(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """Re-running a completed build without resume rebuilds cleanly rather than colliding."""
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    before = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    _first_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    after = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    before.pop("built_at")
    after.pop("built_at")
    assert before == after
