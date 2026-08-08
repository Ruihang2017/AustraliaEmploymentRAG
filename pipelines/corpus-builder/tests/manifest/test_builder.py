"""Acceptance item 11, first half — a missing input is `ManifestIncomplete` NAMING the field."""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from manifest_fixtures import (
    compatibility_fixture,
    counts_fixture,
    coverage_fixture,
    document_pin,
    profile_fixture,
    read_manifest,
    runtime_pin,
    versions_fixture,
)

from contracts.schema import create_corpus_database
from manifest import (
    MANIFEST_VERSION,
    ManifestIncomplete,
    QuarantineSummary,
    build_release_manifest,
    directory_digest,
    manifest_sha256,
)
from manifest.builder import READ_BLOCK_BYTES, walk_bundle_files


def _minimal_bundle(tmp_path: Path) -> Path:
    bundle = tmp_path / "bundle"
    bundle.mkdir()
    create_corpus_database(bundle / "corpus.sqlite")
    (bundle / "tantivy").mkdir()
    (bundle / "tantivy" / "meta.json").write_bytes(b"{}\n")
    (bundle / "vectors.usearch").write_bytes(b"v\n")
    (bundle / "embedding-manifest.json").write_bytes(b"{}\n")
    return bundle


def _kwargs(**overrides):
    base = dict(
        release_id="rel-0001",
        release_kind="CANDIDATE",
        parent_release_id=None,
        versions=versions_fixture(),
        compatibility=compatibility_fixture(),
        counts=counts_fixture(),
        coverage=coverage_fixture(),
        quarantine=QuarantineSummary(open_count=0, resolved_count=0, by_reason_code={}),
        evaluation=None,
        embedding_profile=profile_fixture(),
        local_models=(document_pin(),),
        runtime=runtime_pin(),
        build_started_at="2026-01-01T00:00:00Z",
        build_finished_at="2026-01-01T00:10:00Z",
    )
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    "field",
    [
        "release_id",
        "versions",
        "compatibility",
        "counts",
        "coverage",
        "quarantine",
        "embedding_profile",
        "local_models",
        "runtime",
        "build_started_at",
        "build_finished_at",
    ],
)
def test_an_absent_input_names_the_field(tmp_path: Path, field: str) -> None:
    bundle = _minimal_bundle(tmp_path)
    with pytest.raises(ManifestIncomplete) as error:
        build_release_manifest(bundle, **_kwargs(**{field: None}))
    assert field in str(error.value)


def test_an_empty_local_models_list_is_refused(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    with pytest.raises(ManifestIncomplete) as error:
        build_release_manifest(bundle, **_kwargs(local_models=()))
    assert "at least one role" in str(error.value)


def test_a_duplicate_role_is_refused(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    with pytest.raises(ManifestIncomplete):
        build_release_manifest(bundle, **_kwargs(local_models=(document_pin(), document_pin())))


def test_an_unknown_release_kind_is_refused(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    with pytest.raises(ManifestIncomplete):
        build_release_manifest(bundle, **_kwargs(release_kind="PROMOTED"))


def test_an_absent_bundle_directory_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ManifestIncomplete):
        build_release_manifest(tmp_path / "nope", **_kwargs())


def test_an_absent_prd_artifact_is_refused(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    (bundle / "vectors.usearch").unlink()
    with pytest.raises(ManifestIncomplete) as error:
        build_release_manifest(bundle, **_kwargs())
    assert "vectors.usearch" in str(error.value)


# -- files[] rules --------------------------------------------------------------------------------


def test_files_are_sorted_posix_relative_and_exclude_the_manifest(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    (bundle / "release-manifest.json").write_bytes(b"{}\n")  # a leftover from an earlier build
    (bundle / "nested").mkdir()
    (bundle / "nested" / "b.bin").write_bytes(b"b")
    (bundle / "nested" / "a.bin").write_bytes(b"a")
    manifest = build_release_manifest(bundle, **_kwargs())
    paths = [entry.path for entry in manifest.files]
    assert paths == sorted(paths)
    assert "release-manifest.json" not in paths
    assert "nested/a.bin" in paths and "\\" not in "".join(paths)


def test_a_symlink_is_refused_at_build_time(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    try:
        (bundle / "link.bin").symlink_to(bundle / "vectors.usearch")
    except (OSError, NotImplementedError):
        pytest.skip("this platform/user cannot create symlinks")
    with pytest.raises(ManifestIncomplete) as error:
        walk_bundle_files(bundle)
    assert "symlink" in str(error.value)


def test_a_large_file_is_hashed_in_streaming_blocks(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    payload = bytes(range(256)) * ((READ_BLOCK_BYTES // 256) + 17)
    assert len(payload) > READ_BLOCK_BYTES
    (bundle / "big.bin").write_bytes(payload)
    manifest = build_release_manifest(bundle, **_kwargs())
    entry = next(item for item in manifest.files if item.path == "big.bin")
    assert entry.sha256 == hashlib.sha256(payload).hexdigest()
    assert entry.byte_size == len(payload)


def test_the_lexical_index_digest_is_the_documented_directory_digest(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    (bundle / "tantivy" / "second.bin").write_bytes(b"second\n")
    manifest = build_release_manifest(bundle, **_kwargs())
    expected = hashlib.sha256(
        (
            f"tantivy/meta.json\x1f{hashlib.sha256(b'{}\n').hexdigest()}\n"
            f"tantivy/second.bin\x1f{hashlib.sha256(b'second\n').hexdigest()}\n"
        ).encode("utf-8")
    ).hexdigest()
    assert manifest.artifacts.lexical_index_sha256 == expected


def test_an_empty_lexical_index_digests_the_empty_string(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    (bundle / "tantivy" / "meta.json").unlink()
    assert directory_digest(bundle / "tantivy", bundle) == hashlib.sha256(b"").hexdigest()


def test_the_artifact_hashes_equal_their_file_entries(tmp_path: Path) -> None:
    bundle = _minimal_bundle(tmp_path)
    manifest = build_release_manifest(bundle, **_kwargs())
    by_path = {entry.path: entry.sha256 for entry in manifest.files}
    assert manifest.artifacts.corpus_sqlite_sha256 == by_path["corpus.sqlite"]
    assert manifest.artifacts.vector_index_sha256 == by_path["vectors.usearch"]
    assert manifest.artifacts.embedding_manifest_sha256 == by_path["embedding-manifest.json"]


# -- assembly -------------------------------------------------------------------------------------


def test_the_recorded_digest_matches_the_canonical_form(tmp_path: Path) -> None:
    manifest = build_release_manifest(_minimal_bundle(tmp_path), **_kwargs())
    assert manifest.manifest_sha256 == manifest_sha256(manifest.to_dict())
    assert manifest.manifest_version == MANIFEST_VERSION
    assert manifest.signature is None


def test_no_evaluation_becomes_the_explicit_not_run_shape(tmp_path: Path) -> None:
    manifest = build_release_manifest(_minimal_bundle(tmp_path), **_kwargs(evaluation=None))
    assert manifest.evaluation.to_dict() == {
        "status": "NOT_RUN",
        "report_id": None,
        "ran_at": None,
        "metrics": {},
        "gates": [],
    }


def test_created_at_defaults_to_the_build_finish_time(tmp_path: Path) -> None:
    manifest = build_release_manifest(_minimal_bundle(tmp_path), **_kwargs())
    assert manifest.created_at == "2026-01-01T00:10:00Z"


def test_the_manifest_is_frozen_after_hashing(bundle_factory) -> None:
    from dataclasses import FrozenInstanceError

    from manifest import ReleaseManifest

    manifest = ReleaseManifest.from_dict(read_manifest(bundle_factory()))
    with pytest.raises(FrozenInstanceError):
        manifest.release_id = "rel-mutated"  # type: ignore[misc]
