"""The security property the reviewer will check first.

`verify_bundle()` reads files named by a manifest whose signature may be invalid — it must, because
deliverable 10 requires it to collect every finding rather than stopping at the signature. So every
`files[].path` is validated BEFORE any I/O, and a path that fails is reported and NEVER opened.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from manifest_fixtures import read_manifest, write_raw_manifest

from manifest import verify_bundle
from manifest.verify import _unsafe_reason


@pytest.mark.parametrize(
    "candidate",
    [
        "../escape.txt",
        "../../etc/passwd",
        "/absolute/path",
        "C:\\windows\\system32\\config",
        "C:/windows/system32/config",
        "a/../../b",
        "a\\b",
        "./a",
        "a//b",
        "",
        None,
        42,
    ],
)
def test_an_unsafe_path_is_reported_and_never_read(
    bundle_factory, trusted_keys, candidate
) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["files"].append({"path": candidate, "sha256": "0" * 64, "byte_size": 1})
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "BUNDLE_PATH_UNSAFE" in report.codes()
    finding = report.by_code("BUNDLE_PATH_UNSAFE")[0]
    assert "was NOT read" in finding.message
    assert not report.ok


def test_the_secret_outside_the_bundle_is_not_hashed(bundle_factory, trusted_keys, tmp_path: Path) -> None:
    """The end-to-end property: a traversal attempt yields a finding, not a leaked digest."""
    outside = tmp_path / "outside-the-bundle.txt"
    outside.write_bytes(b"not part of any release\n")
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["files"].append(
        {"path": f"../{outside.name}", "sha256": "0" * 64, "byte_size": outside.stat().st_size}
    )
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "BUNDLE_PATH_UNSAFE" in report.codes()
    # Neither a hash nor a size mismatch for the outside file: it was never opened or stat()ed.
    assert "FILE_HASH_MISMATCH" not in report.codes()
    assert "FILE_SIZE_MISMATCH" not in report.codes()


@pytest.mark.parametrize("candidate", ["corpus.sqlite", "tantivy/meta.json", "a/b/c.bin"])
def test_a_safe_relative_path_is_accepted(tmp_path: Path, candidate: str) -> None:
    assert _unsafe_reason(tmp_path, candidate) is None


def test_a_symlink_in_the_bundle_is_refused_not_followed(
    bundle_factory, trusted_keys, tmp_path: Path
) -> None:
    outside = tmp_path / "target.txt"
    outside.write_bytes(b"outside\n")
    bundle = bundle_factory()
    link = bundle / "link.bin"
    try:
        link.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("this platform/user cannot create symlinks")
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_NOT_REGULAR" in report.codes()
    assert any("does not follow" in finding.message for finding in report.by_code("FILE_NOT_REGULAR"))
    assert not report.ok


def test_a_listed_directory_is_refused(bundle_factory, trusted_keys) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    document["files"].append({"path": "tantivy", "sha256": "0" * 64, "byte_size": 0})
    write_raw_manifest(bundle, document)
    report = verify_bundle(bundle, public_keys=trusted_keys)
    assert "FILE_NOT_REGULAR" in report.codes()
