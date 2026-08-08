"""Assemble a release manifest from EXPLICIT inputs (CRPS-02 deliverable 7).

NOTHING HERE IS INFERRED. Breakdown plan §8 Q11 (confirmed) makes every model, tokenizer and
runtime value an input the release process supplies — "never a locally invented default". This
module therefore reads no environment variable, resolves no crate version from a lockfile, imports
no `importlib.metadata`, and defaults no pin. A missing input raises `ManifestIncomplete` naming the
field. `tests/manifest/test_no_environment_inference.py` asserts that mechanically over the whole
package's source.

files[] RULES, which RETR-01 and RLSE-07 re-implement:

* paths are bundle-root-relative and '/'-separated (`Path.as_posix()`; the build machine may be
  Windows), sorted ascending by path;
* `release-manifest.json` is EXCLUDED — a manifest cannot carry its own hash. Its integrity is
  `manifest_sha256` plus the detached signature;
* symlinks and other non-regular files are refused at build time; a bundle that contains one is not
  hashable in a way a verifier can reproduce;
* hashing streams in 1 MiB blocks and never loads a file whole (a release bundle is large, PRD
  §17.2).

`artifacts.lexical_index_sha256` is a DIRECTORY digest, because `tantivy/` is a directory: SHA-256
over `"<relative path>\\x1f<file sha256>\\n"` for every file beneath it in sorted path order, UTF-8
encoded. An empty directory digests the empty string. The style mirrors
`contracts.schema.schema_fingerprint()`.
"""

from __future__ import annotations

import hashlib
from dataclasses import replace
from pathlib import Path
from typing import Iterable, Sequence

from .canonical import manifest_sha256 as _digest_of
from .model import (
    MANIFEST_VERSION,
    RELEASE_KINDS,
    Artifacts,
    CompatibilityRanges,
    Counts,
    CoverageEntry,
    EmbeddingProfileRef,
    EvaluationSummary,
    FileEntry,
    ManifestIncomplete,
    ModelPin,
    QuarantineSummary,
    ReleaseManifest,
    RuntimePin,
    Versions,
    not_run_evaluation,
)

__all__ = [
    "BUNDLE_LAYOUT",
    "BUNDLE_LEXICAL_INDEX_DIR",
    "MANIFEST_FILENAME",
    "READ_BLOCK_BYTES",
    "build_release_manifest",
    "directory_digest",
    "file_sha256",
    "walk_bundle_files",
]

#: PRD §18.4's fixed bundle layout — exactly five entries, and this ticket adds none (sub-PRD D15).
BUNDLE_LAYOUT: tuple[str, ...] = (
    "corpus.sqlite",
    "tantivy/",
    "vectors.usearch",
    "embedding-manifest.json",
    "release-manifest.json",
)

MANIFEST_FILENAME = "release-manifest.json"
EMBEDDING_MANIFEST_FILENAME = "embedding-manifest.json"
CORPUS_DATABASE_FILENAME = "corpus.sqlite"
VECTOR_INDEX_FILENAME = "vectors.usearch"
BUNDLE_LEXICAL_INDEX_DIR = "tantivy"

#: A release bundle is large (PRD §17.2's planning hypothesis); never read a file whole.
READ_BLOCK_BYTES = 1024 * 1024


def file_sha256(path: Path) -> str:
    """Streaming lowercase-hex SHA-256 of *path*."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            block = handle.read(READ_BLOCK_BYTES)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def walk_bundle_files(bundle_dir: Path) -> list[Path]:
    """Every regular file under *bundle_dir* except the release manifest, sorted by POSIX path.

    Raises `ManifestIncomplete` on a symlink or any other non-regular entry: a bundle whose contents
    depend on what a link points at cannot be hashed reproducibly.
    """
    found: list[Path] = []
    for path in sorted(bundle_dir.rglob("*"), key=lambda item: item.relative_to(bundle_dir).as_posix()):
        if path.is_symlink():
            raise ManifestIncomplete(
                f"{path.relative_to(bundle_dir).as_posix()} is a symlink; a release bundle contains "
                "regular files only, so that its hashes are reproducible"
            )
        if path.is_dir():
            continue
        if not path.is_file():
            raise ManifestIncomplete(
                f"{path.relative_to(bundle_dir).as_posix()} is not a regular file"
            )
        if path.relative_to(bundle_dir).as_posix() == MANIFEST_FILENAME:
            continue
        found.append(path)
    return found


def directory_digest(directory: Path, bundle_dir: Path) -> str:
    """The lexical-index directory digest defined in this module's docstring.

    An absent directory digests as empty, exactly as an empty one does — the verifier reports the
    absence itself as `BUNDLE_PATH_MISSING`, so the digest never has to encode two failures.
    """
    digest = hashlib.sha256()
    parts: list[str] = []
    if directory.is_dir():
        for path in sorted(
            (item for item in directory.rglob("*") if item.is_file() and not item.is_symlink()),
            key=lambda item: item.relative_to(bundle_dir).as_posix(),
        ):
            parts.append(f"{path.relative_to(bundle_dir).as_posix()}\x1f{file_sha256(path)}\n")
    digest.update("".join(parts).encode("utf-8"))
    return digest.hexdigest()


def _require_input(value: object, field: str) -> object:
    if value is None:
        raise ManifestIncomplete(
            f"{field} is a required build input and was absent — breakdown plan §8 Q11 makes it an "
            "explicit input supplied by the release process, never an environment lookup, a "
            "lockfile read or a default"
        )
    return value


def _entry_for(paths: Iterable[FileEntry], name: str) -> FileEntry | None:
    for entry in paths:
        if entry.path == name:
            return entry
    return None


def build_release_manifest(
    bundle_dir: Path,
    *,
    release_id: str,
    release_kind: str,
    parent_release_id: str | None,
    versions: Versions | None,
    compatibility: CompatibilityRanges | None,
    counts: Counts | None,
    coverage: Sequence[CoverageEntry] | None,
    quarantine: QuarantineSummary | None,
    evaluation: EvaluationSummary | None,
    embedding_profile: EmbeddingProfileRef | None,
    local_models: Sequence[ModelPin] | None,
    runtime: RuntimePin | None,
    build_started_at: str,
    build_finished_at: str,
    created_at: str | None = None,
) -> ReleaseManifest:
    """Build, canonicalise and hash a release manifest. The caller signs it next.

    Every pin argument is typed `| None` ON PURPOSE: a caller that forgets one gets a
    `ManifestIncomplete` naming the field (acceptance item 11), not a `TypeError` from Python's
    argument binding, which names nothing useful and is not the contract's error.
    """
    if not bundle_dir.is_dir():
        raise ManifestIncomplete(f"bundle_dir does not exist or is not a directory: {bundle_dir}")
    if release_kind not in RELEASE_KINDS:
        raise ManifestIncomplete(
            f"release_kind must be one of {RELEASE_KINDS!r}, got {release_kind!r}"
        )
    for value, field in (
        (release_id, "release_id"),
        (versions, "versions"),
        (compatibility, "compatibility"),
        (counts, "counts"),
        (coverage, "coverage"),
        (quarantine, "quarantine"),
        (embedding_profile, "embedding_profile"),
        (local_models, "local_models"),
        (runtime, "runtime"),
        (build_started_at, "build_started_at"),
        (build_finished_at, "build_finished_at"),
    ):
        _require_input(value, field)
    assert versions is not None and compatibility is not None and counts is not None
    assert coverage is not None and quarantine is not None and embedding_profile is not None
    assert local_models is not None and runtime is not None

    if len(local_models) == 0:
        raise ManifestIncomplete(
            "local_models must pin at least one role — breakdown plan §8 Q11 requires the release "
            "to pin its models, and an empty list pins nothing"
        )
    roles = [pin.role for pin in local_models]
    if len(set(roles)) != len(roles):
        raise ManifestIncomplete(f"local_models pins a role twice: {sorted(roles)}")

    files = tuple(
        FileEntry(
            path=path.relative_to(bundle_dir).as_posix(),
            sha256=file_sha256(path),
            byte_size=path.stat().st_size,
        )
        for path in walk_bundle_files(bundle_dir)
    )

    artifacts = Artifacts(
        corpus_sqlite_sha256=_artifact_hash(files, CORPUS_DATABASE_FILENAME),
        lexical_index_sha256=directory_digest(bundle_dir / BUNDLE_LEXICAL_INDEX_DIR, bundle_dir),
        vector_index_sha256=_artifact_hash(files, VECTOR_INDEX_FILENAME),
        embedding_manifest_sha256=_artifact_hash(files, EMBEDDING_MANIFEST_FILENAME),
    )

    manifest = ReleaseManifest(
        manifest_version=MANIFEST_VERSION,
        release_id=release_id,
        release_kind=release_kind,
        parent_release_id=parent_release_id,
        created_at=created_at if created_at is not None else build_finished_at,
        build_started_at=build_started_at,
        build_finished_at=build_finished_at,
        versions=versions,
        compatibility=compatibility,
        files=files,
        artifacts=artifacts,
        counts=counts,
        coverage=tuple(coverage),
        quarantine=quarantine,
        evaluation=evaluation if evaluation is not None else not_run_evaluation(),
        embedding_profile=embedding_profile,
        local_models=tuple(local_models),
        runtime=runtime,
        signature=None,
        manifest_sha256="",
    )
    # build -> canonicalise -> hash. Signing is the caller's next step, and it re-asserts this hash.
    # `manifest_sha256` is excluded from the canonical form, so hashing the placeholder-bearing
    # manifest yields exactly the digest the final object must carry.
    return replace(manifest, manifest_sha256=_digest_of(manifest.to_dict()))


def _artifact_hash(files: Sequence[FileEntry], name: str) -> str:
    entry = _entry_for(files, name)
    if entry is None:
        raise ManifestIncomplete(
            f"the bundle has no {name}; PRD §18.4 fixes the release layout and its artifact hash "
            "cannot be recorded without it"
        )
    return entry.sha256


def bundle_layout_paths() -> tuple[str, ...]:
    """PRD §18.4's five entries, for a consumer that wants the list without re-reading the PRD."""
    return BUNDLE_LAYOUT
