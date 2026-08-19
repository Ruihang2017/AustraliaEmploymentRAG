"""The ticket's `[fixture]` acceptance item: an end-to-end build over the COMMITTED small corpus
fixture reproduces the RECORDED GOLDEN manifest, and a second run reproduces identical artifact
hashes.

REGRESSION (reviewer, BLOCKING — unmet acceptance item). `test_build_determinism.py` compares two
freshly generated candidates against each other. That is a self-consistency check: a regression in
how every manifest is assembled — a mis-derived count, a dropped coverage entry, a hash taken over
the wrong bytes — keeps both sides equal and passes silently. The acceptance item asks instead for a
comparison against values recorded once, on disk, and reviewed by a human, exactly as
`tests/manifest/fixtures/golden/` does for CRPS-02 and `tests/chunking`'s golden fixture does for
CRPS-03. This module is that comparison.

The fixture, what is excluded from the comparison and why, and how to regenerate it deliberately:
`small_corpus_fixture.py` and `fixtures/small-corpus/README.md`.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from candidate_fixtures import FixtureLexicalIndexBuilder
from candidate_paths import SRC  # noqa: F401
from small_corpus_fixture import (
    CORPUS_DB,
    EMBEDDING_DIR,
    EVALUATION_REPORT,
    GOLDEN_MANIFEST,
    RELEASE_ID,
    VOLATILE_MEMBERS,
    fixture_request,
    golden_manifest,
    stable_manifest,
)

from build import assemble_bundle
from manifest import verify_bundle, public_keys_from
from candidate_paths import DEV_PUBLIC_KEYFILE


def _build(output_dir: Path):
    outcome = assemble_bundle(
        fixture_request(output_dir), index_builder=FixtureLexicalIndexBuilder()
    )
    assert outcome.decision == "BUILT", outcome.gate_report.to_dict()
    assert outcome.bundle_dir is not None
    return outcome


def test_the_fixture_is_committed_and_complete() -> None:
    """A missing fixture file must fail as a missing FIXTURE, not as a mysterious build error."""
    for path in (
        CORPUS_DB,
        EMBEDDING_DIR / "vectors.usearch",
        EMBEDDING_DIR / "embedding-manifest.json",
        EMBEDDING_DIR / "embedding-build-report.json",
        EVALUATION_REPORT,
        GOLDEN_MANIFEST,
    ):
        assert path.is_file(), f"the committed fixture file {path} is missing"


def test_the_hashed_fixture_files_were_checked_out_unconverted() -> None:
    """A CRLF-mangled checkout must fail as a CHECKOUT problem, not as a mysterious hash mismatch.

    `embedding-manifest.json` is hashed byte for byte into `artifacts.embedding_manifest_sha256` and
    into `files[]`. This machine's `core.autocrlf` is `true`, so without
    `fixtures/.gitattributes`' `* -text` git would rewrite it on checkout and every recorded hash
    would miss on a fresh clone while passing on the machine that generated the fixture.
    """
    assert b"\r\n" not in (EMBEDDING_DIR / "embedding-manifest.json").read_bytes()


def test_the_build_reproduces_the_recorded_golden_manifest(tmp_path: Path) -> None:
    outcome = _build(tmp_path / "out")
    produced = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    golden = golden_manifest()

    assert stable_manifest(produced) == stable_manifest(golden)
    # Every hash, count, coverage entry, pin, version and file entry above is compared; only the
    # wall-clock members and the signature that covers them are excluded, and they must still be
    # PRESENT — an omitted timestamp is a defect, not a permitted difference.
    for member in VOLATILE_MEMBERS:
        assert member in produced, member
    assert produced["manifest_sha256"]
    assert produced["signature"]["key_id"].startswith("dev-")


def test_the_recorded_artifact_hashes_are_reproduced_exactly(tmp_path: Path) -> None:
    """`artifacts.*` is the part of the manifest a consumer verifies a downloaded bundle against."""
    produced = json.loads(
        (_build(tmp_path / "out").bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert produced["artifacts"] == golden_manifest()["artifacts"]
    assert produced["artifacts"]["corpus_sqlite_sha256"] == hashlib.sha256(
        CORPUS_DB.read_bytes()
    ).hexdigest()


def test_a_second_run_over_the_same_input_reproduces_identical_artifact_hashes(
    tmp_path: Path,
) -> None:
    first = json.loads(
        (_build(tmp_path / "out-a").bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    second = json.loads(
        (_build(tmp_path / "out-b").bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert first["artifacts"] == second["artifacts"]
    assert first["files"] == second["files"]


def test_the_built_bundle_verifies_and_holds_exactly_the_five_prd_entries(tmp_path: Path) -> None:
    outcome = _build(tmp_path / "out")
    report = verify_bundle(outcome.bundle_dir, public_keys=public_keys_from(DEV_PUBLIC_KEYFILE))
    assert report.ok, [f"{f.severity} {f.code} {f.message}" for f in report.findings]
    assert {entry.name for entry in outcome.bundle_dir.iterdir()} == {
        "corpus.sqlite",
        "tantivy",
        "vectors.usearch",
        "embedding-manifest.json",
        "release-manifest.json",
    }


def test_the_committed_corpus_database_is_never_mutated_by_a_build(tmp_path: Path) -> None:
    """The fixture is committed, so a build that wrote to it would show up as a dirty working tree
    — but the check belongs in the suite, not in a reviewer's `git status`."""
    before = hashlib.sha256(CORPUS_DB.read_bytes()).hexdigest()
    _build(tmp_path / "out")
    assert hashlib.sha256(CORPUS_DB.read_bytes()).hexdigest() == before


def test_the_golden_manifest_records_the_fixture_s_release_id() -> None:
    golden = golden_manifest()
    assert golden["release_id"] == RELEASE_ID
    assert golden["release_kind"] == "CANDIDATE"
