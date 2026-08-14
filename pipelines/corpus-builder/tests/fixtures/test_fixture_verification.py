"""The committed bundle verifies — genuinely, and visibly non-vacuously.

Verification is CRPS-02's `verify_bundle()`, the same function RETR-01 re-implements in Rust. It is
never stubbed or monkeypatched here, and the trust map is built only from the committed development
PUBLIC key file.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from fixture_release_helpers import COMMITTED_BUNDLE_DIR, DEV_SIGNER_ID, bundle_file_map

from manifest import DEVELOPMENT_SIGNER_PREFIX, verify_bundle


def _manifest() -> dict:
    return json.loads((COMMITTED_BUNDLE_DIR / "release-manifest.json").read_text(encoding="utf-8"))


def test_the_committed_bundle_verifies(trusted_keys: dict[str, bytes]) -> None:
    report = verify_bundle(COMMITTED_BUNDLE_DIR, public_keys=trusted_keys)
    assert report.ok, [
        f"{finding.code} [{finding.subject}] {finding.message}" for finding in report.blocking()
    ]
    assert report.release_kind == "SYNTHETIC_FIXTURE"


def test_the_synthetic_fixture_marker_is_reported(trusted_keys: dict[str, bytes]) -> None:
    """`RLSE-07`/`CRPS-07` refuse a bundle on this finding alone, so it must actually be emitted."""
    report = verify_bundle(COMMITTED_BUNDLE_DIR, public_keys=trusted_keys)
    marker = report.by_code("RELEASE_KIND_SYNTHETIC_FIXTURE")
    assert len(marker) == 1
    assert marker[0].severity == "INFO"


def test_the_signature_is_a_development_signature(trusted_keys: dict[str, bytes]) -> None:
    document = _manifest()
    assert document["signature"]["algorithm"] == "ED25519"
    assert document["signature"]["key_id"] == DEV_SIGNER_ID
    assert document["signature"]["key_id"].startswith(DEVELOPMENT_SIGNER_PREFIX)

    report = verify_bundle(COMMITTED_BUNDLE_DIR, public_keys=trusted_keys)
    development = report.by_code("SIGNATURE_SIGNER_DEVELOPMENT")
    assert len(development) == 1
    # INFO rather than WARNING precisely because this IS a synthetic fixture (signing.py:264-274).
    assert development[0].severity == "INFO"


def test_stub_pins_are_reported_as_info_not_hidden(trusted_keys: dict[str, bytes]) -> None:
    """The placeholder pins are declared and downgraded — not absent."""
    report = verify_bundle(COMMITTED_BUNDLE_DIR, public_keys=trusted_keys)
    stubs = report.by_code("PIN_STUB")
    assert stubs, "a stub-pinned fixture that reports no PIN_STUB finding is disguising itself"
    assert {finding.severity for finding in stubs} == {"INFO"}


def test_a_tampered_copy_fails_so_the_green_run_is_not_vacuous(
    tmp_path: Path, trusted_keys: dict[str, bytes]
) -> None:
    """Negative control: flip one byte of `corpus.sqlite` in a COPY and the report must not be ok.

    The byte flipped is the SQLite header's file-change counter (offset 24), NOT an arbitrary one.
    A flip inside a stored text value makes `verify_bundle()` raise `UnicodeDecodeError` out of
    step 7 instead of reporting `CORPUS_DATABASE_UNREADABLE` — observed on this branch, reported as
    a CRPS-02 robustness gap rather than worked around by loosening anything here. This control
    exercises the hash check, which is what it is for.
    """
    copied = tmp_path / "tampered"
    shutil.copytree(COMMITTED_BUNDLE_DIR, copied)
    database = copied / "corpus.sqlite"
    raw = bytearray(database.read_bytes())
    raw[24] ^= 0xFF
    database.write_bytes(bytes(raw))

    report = verify_bundle(copied, public_keys=trusted_keys)
    assert not report.ok
    assert "FILE_HASH_MISMATCH" in report.codes()


def test_an_untrusted_key_map_is_a_signer_unknown_finding() -> None:
    """A second negative control: the signature is checked against the trust map, not assumed."""
    report = verify_bundle(COMMITTED_BUNDLE_DIR, public_keys={"someone-else": b"\x00" * 32})
    assert not report.ok
    assert "SIGNATURE_SIGNER_UNKNOWN" in report.codes()


def test_the_bundle_holds_exactly_the_prd_18_4_members() -> None:
    assert sorted(bundle_file_map(COMMITTED_BUNDLE_DIR)) == [
        "corpus.sqlite",
        "embedding-manifest.json",
        "release-manifest.json",
        "tantivy/INDEX_STATE.json",
        "vectors.usearch",
    ]
