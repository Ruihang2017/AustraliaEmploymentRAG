"""Acceptance items 6, 7, 8 — the verifier reports the whole picture, in both directions."""

from __future__ import annotations

import pytest
from manifest_fixtures import altered_hex, read_manifest, versions_fixture, write_raw_manifest

from dataclasses import replace

from manifest import Compatibility, verify_bundle


def test_three_independent_defects_produce_three_findings(bundle_factory, trusted_keys) -> None:
    """Deliverable 10: collect all findings rather than stopping at the first."""
    bundle = bundle_factory()
    document = read_manifest(bundle)
    # 1: a file listed but absent.
    document["files"].append({"path": "ghost.bin", "sha256": "0" * 64, "byte_size": 1})
    # 2: versions.schema disagrees with corpus_meta.
    document["versions"]["schema"] = "99.0.0"
    # 3: an artifact hash that disagrees with files[].
    current = document["artifacts"]["vector_index_sha256"]
    document["artifacts"]["vector_index_sha256"] = altered_hex(current)
    write_raw_manifest(bundle, document)

    report = verify_bundle(bundle, public_keys=trusted_keys)
    codes = set(report.codes())
    assert {"FILE_LISTED_BUT_ABSENT", "CORPUS_SCHEMA_VERSION_MISMATCH", "ARTIFACT_HASH_MISMATCH"} <= codes
    assert not report.ok


def test_a_file_present_but_unlisted_fails(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "stowaway.bin").write_bytes(b"unlisted\n")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "BUNDLE_FILE_UNLISTED" in report.codes()
    assert any(finding.subject == "stowaway.bin" for finding in report.by_code("BUNDLE_FILE_UNLISTED"))
    assert not report.ok


def test_a_file_listed_but_absent_fails(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["files"].append({"path": "absent.bin", "sha256": "a" * 64, "byte_size": 3})
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_LISTED_BUT_ABSENT" in report.codes()


def test_a_missing_prd_bundle_path_fails(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "vectors.usearch").unlink()
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "BUNDLE_PATH_MISSING" in report.codes()
    assert "FILE_LISTED_BUT_ABSENT" in report.codes()


def test_a_missing_lexical_index_directory_fails(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "tantivy" / "meta.json").unlink()
    (bundle / "tantivy").rmdir()
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "BUNDLE_PATH_MISSING" in report.codes()
    assert any(finding.subject == "tantivy/" for finding in report.by_code("BUNDLE_PATH_MISSING"))


def test_a_schema_version_mismatch_fails(bundle_factory, trusted_keys) -> None:
    versions = replace(versions_fixture(), schema="99.0.0")
    bundle = bundle_factory(versions=versions)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "CORPUS_SCHEMA_VERSION_MISMATCH" in report.codes()
    assert not report.ok


def test_a_manifest_that_lists_itself_is_reported(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["files"].append({"path": "release-manifest.json", "sha256": "b" * 64, "byte_size": 1})
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_SELF_REFERENCE" in report.codes()


def test_an_unsupported_manifest_version_skips_schema_validation_and_says_so(
    bundle_factory, trusted_keys
) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["manifest_version"] = "9.0.0"
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    finding = report.by_code("MANIFEST_VERSION_UNSUPPORTED")[0]
    assert "validation was skipped" in finding.message
    assert "MANIFEST_SCHEMA_INVALID" not in report.codes()
    assert not report.ok


def test_a_non_semver_manifest_version_is_reported(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["manifest_version"] = "one"
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "MANIFEST_VERSION_UNSUPPORTED" in report.codes()


def test_a_schema_violation_is_reported(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    del document["counts"]["chunks"]
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "MANIFEST_SCHEMA_INVALID" in report.codes()


@pytest.mark.parametrize(
    "expected,code",
    [
        (Compatibility(app_version="0.9.0"), "COMPATIBILITY_OUT_OF_RANGE"),
        (Compatibility(app_version="3.0.0"), "COMPATIBILITY_OUT_OF_RANGE"),
        (Compatibility(search_version="0.1.0"), "COMPATIBILITY_OUT_OF_RANGE"),
        (Compatibility(corpus_schema="99.0.0"), "COMPATIBILITY_OUT_OF_RANGE"),
        (Compatibility(app_version="not-a-version"), "COMPATIBILITY_VERSION_UNPARSEABLE"),
    ],
)
def test_compatibility_is_checked_when_the_consumer_states_it(
    bundle_factory, trusted_keys, expected: Compatibility, code: str
) -> None:
    report = verify_bundle(bundle_factory(), public_keys=trusted_keys, expected=expected)
    assert code in report.codes()
    assert not report.ok


@pytest.mark.parametrize(
    "expected",
    [
        None,
        Compatibility(),
        Compatibility(app_version="1.5.0", search_version="9999.0.0", corpus_schema="1.0.0"),
    ],
)
def test_compatibility_passes_inside_the_range_and_when_unstated(
    bundle_factory, trusted_keys, expected
) -> None:
    report = verify_bundle(bundle_factory(), public_keys=trusted_keys, expected=expected)
    assert "COMPATIBILITY_OUT_OF_RANGE" not in report.codes()
    assert report.ok


def test_a_clean_bundle_is_ok_and_carries_only_a_development_warning(
    bundle_factory, trusted_keys
) -> None:
    report = verify_bundle(bundle_factory(), public_keys=trusted_keys)
    assert report.ok
    assert report.blocking() == ()
    assert report.codes() == ("SIGNATURE_SIGNER_DEVELOPMENT",)


def test_ok_is_false_whenever_any_blocking_finding_is_present(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    (bundle / "stowaway.bin").write_bytes(b"x")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert report.blocking() and report.ok is False
