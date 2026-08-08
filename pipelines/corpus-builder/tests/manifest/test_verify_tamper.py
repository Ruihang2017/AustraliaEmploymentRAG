"""Acceptance item 4 — one byte changed anywhere in the bundle makes `verify_bundle()` block.

The mutations are deliberate rather than random: a byte in a SQLite page body, a byte in a value the
JSON parser will still accept, so the expected code is deterministic rather than "whatever fires
first". This is the reference tamper matrix RETR-01 and RLSE-07 copy.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from manifest_fixtures import altered_hex, read_manifest, write_raw_manifest

from manifest import verify_bundle


def _flip(path: Path, offset: int) -> None:
    raw = bytearray(path.read_bytes())
    raw[offset] ^= 0x01
    path.write_bytes(bytes(raw))


@pytest.mark.parametrize("filename", ["corpus.sqlite", "vectors.usearch", "embedding-manifest.json"])
def test_a_flipped_byte_in_a_bundle_file_blocks(bundle_factory, trusted_keys, filename: str) -> None:
    bundle = bundle_factory()
    target = bundle / filename
    # Well past any header, inside the payload, so the file still parses/opens.
    _flip(target, target.stat().st_size // 2)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert not report.ok
    assert "FILE_HASH_MISMATCH" in report.codes()
    assert any(finding.subject == filename for finding in report.by_code("FILE_HASH_MISMATCH"))


def test_a_flipped_byte_in_the_lexical_index_blocks(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    target = bundle / "tantivy" / "meta.json"
    _flip(target, 3)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert not report.ok
    assert "FILE_HASH_MISMATCH" in report.codes()
    assert "ARTIFACT_HASH_MISMATCH" in report.codes()


def test_a_truncated_file_is_a_size_mismatch_not_a_hash_read(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    target = bundle / "vectors.usearch"
    target.write_bytes(target.read_bytes()[:-1])
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_SIZE_MISMATCH" in report.codes()
    assert "FILE_HASH_MISMATCH" not in report.codes()


def test_an_altered_manifest_member_blocks_on_the_digest_and_the_signature(
    bundle_factory, trusted_keys
) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["release_id"] = "rel-0002"
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert not report.ok
    assert "MANIFEST_SHA256_MISMATCH" in report.codes()
    assert "SIGNATURE_INVALID" in report.codes()


def test_an_altered_recorded_file_hash_blocks(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    entry = next(item for item in document["files"] if item["path"] == "corpus.sqlite")
    recorded = entry["sha256"]
    entry["sha256"] = altered_hex(recorded)
    # corpus.sqlite is not byte-stable across runs, so its digest is not either: assert the mutation
    # actually happened rather than trusting a leading-digit substitution.
    assert entry["sha256"] != recorded
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_HASH_MISMATCH" in report.codes()
    assert "ARTIFACT_HASH_MISMATCH" in report.codes()


def test_an_altered_artifact_hash_alone_is_its_own_code(bundle_factory, trusted_keys) -> None:
    """`artifacts.*` disagreeing with `files[]` is distinct from a file that does not match disk."""
    bundle = bundle_factory()
    document = read_manifest(bundle)
    current = document["artifacts"]["corpus_sqlite_sha256"]
    document["artifacts"]["corpus_sqlite_sha256"] = altered_hex(current)
    assert document["artifacts"]["corpus_sqlite_sha256"] != current
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "ARTIFACT_HASH_MISMATCH" in report.codes()
    assert "FILE_HASH_MISMATCH" not in report.codes()


def test_altered_hex_changes_every_possible_leading_digit() -> None:
    """Regression guard for the flaky tamper mutation.

    Overwriting the first nibble with a fixed digit silently did nothing for the sixteenth of runs
    where the digest already began with that digit, so the tamper matrix asserted against an
    untampered bundle. `altered_hex` must change the digest for every leading nibble, and must keep
    it a well-formed 64-character lowercase hex digest.
    """
    for digit in "0123456789abcdef":
        digest = digit + "a" * 63
        mutated = altered_hex(digest)
        assert mutated != digest
        assert len(mutated) == 64
        assert all(character in "0123456789abcdef" for character in mutated)
        assert mutated.endswith("a" * 63)


@pytest.mark.parametrize("bad", ["", "zz", "0" * 63, "0" * 65, "A" * 64])
def test_altered_hex_refuses_anything_that_is_not_a_sha256_digest(bad: str) -> None:
    """A mutation helper that silently accepts a non-digest would hide the same class of no-op."""
    with pytest.raises(AssertionError):
        altered_hex(bad)


def test_no_test_module_hand_rolls_a_hash_mutation() -> None:
    """Every recorded-hash mutation routes through `altered_hex`, never a fixed-digit splice.

    The needle is assembled at runtime so this guard does not match its own source.
    """
    needle = '"' + '0" + '
    suite = Path(__file__).resolve().parent
    offenders = [
        module.name
        for module in sorted(suite.glob("test_*.py"))
        if needle in module.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"hand-rolled hash mutation in {offenders}; use altered_hex()"


def test_a_corrupt_manifest_is_a_finding_not_an_exception(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "release-manifest.json").write_text("{not json", encoding="utf-8")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert report.codes() == ("MANIFEST_UNPARSEABLE",)
    assert report.release_kind is None and not report.ok


def test_an_absent_manifest_is_a_finding(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "release-manifest.json").unlink()
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert report.codes() == ("MANIFEST_ABSENT",)


def test_verify_bundle_never_writes_to_the_bundle(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    before = {
        path.relative_to(bundle).as_posix(): (path.stat().st_size, path.stat().st_mtime_ns)
        for path in sorted(bundle.rglob("*"))
        if path.is_file()
    }
    verify_bundle(bundle, public_keys=trusted_keys)
    after = {
        path.relative_to(bundle).as_posix(): (path.stat().st_size, path.stat().st_mtime_ns)
        for path in sorted(bundle.rglob("*"))
        if path.is_file()
    }
    assert before == after


def test_a_corrupt_corpus_database_yields_a_finding_not_an_exception(
    bundle_factory, trusted_keys
) -> None:
    bundle = bundle_factory()
    (bundle / "corpus.sqlite").write_bytes(b"SQLite format 3\x00" + b"\xff" * 4096)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert not report.ok
    assert "CORPUS_DATABASE_UNREADABLE" in report.codes()
