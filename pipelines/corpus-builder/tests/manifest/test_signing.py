"""Acceptance item 5 — an unknown signer and a tampered signature are DISTINCT codes.

They call for different operator responses: one is a key-distribution problem, the other is
tampering. Collapsing them hides the first behind the second.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from manifest_fixtures import DEV_SIGNER_ID, PRIVATE_KEYFILE, PUBLIC_KEYFILE, read_manifest

from manifest import (
    SigningKeyError,
    UnsupportedKeyFormat,
    load_private_key,
    load_public_key,
    public_keys_from,
    sign_manifest,
    verify_signature,
)
from manifest.signing import ALGORITHM, DEVELOPMENT_SIGNER_PREFIX, SIGNING_KEYFILE_ENV


def _codes(findings) -> list[str]:
    return [finding.code for finding in findings]


def test_sign_then_verify_round_trip(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory())
    findings = verify_signature(document, public_keys=trusted_keys)
    assert _codes(findings) == ["SIGNATURE_SIGNER_DEVELOPMENT"]
    assert findings[0].severity == "WARNING"


def test_an_unknown_signer_is_its_own_code(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    findings = verify_signature(document, public_keys={"someone-else": b"\x00" * 32})
    assert _codes(findings) == ["SIGNATURE_SIGNER_UNKNOWN"]


def test_a_tampered_signature_under_a_known_signer_is_a_different_code(
    bundle_factory, trusted_keys
) -> None:
    document = read_manifest(bundle_factory())
    raw = bytearray(base64.b64decode(document["signature"]["value"]))
    raw[0] ^= 0x01
    document["signature"]["value"] = base64.b64encode(bytes(raw)).decode("ascii")
    findings = verify_signature(document, public_keys=trusted_keys)
    assert _codes(findings) == ["SIGNATURE_INVALID"]


def test_the_two_failures_never_share_a_code(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory())
    unknown = verify_signature(document, public_keys={"other": b"\x00" * 32})
    tampered = dict(document)
    tampered["signature"] = dict(document["signature"], value=base64.b64encode(b"\x00" * 64).decode())
    invalid = verify_signature(tampered, public_keys=trusted_keys)
    assert set(_codes(unknown)).isdisjoint(_codes(invalid))


def test_an_altered_manifest_body_invalidates_the_signature(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory())
    document["release_id"] = "rel-tampered"
    assert _codes(verify_signature(document, public_keys=trusted_keys)) == ["SIGNATURE_INVALID"]


def test_an_absent_signature_is_reported(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory(sign=False))
    assert _codes(verify_signature(document, public_keys=trusted_keys)) == ["SIGNATURE_ABSENT"]


def test_an_unsupported_algorithm_is_reported(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory())
    document["signature"]["algorithm"] = "RSA-PSS"
    assert _codes(verify_signature(document, public_keys=trusted_keys)) == [
        "SIGNATURE_ALGORITHM_UNSUPPORTED"
    ]


def test_a_non_base64_signature_value_is_invalid_not_a_crash(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory())
    document["signature"]["value"] = "!!!not base64!!!"
    assert _codes(verify_signature(document, public_keys=trusted_keys)) == ["SIGNATURE_INVALID"]


def test_the_development_warning_is_informational_for_a_fixture(bundle_factory, trusted_keys) -> None:
    document = read_manifest(bundle_factory(release_kind="SYNTHETIC_FIXTURE"))
    findings = verify_signature(
        document, public_keys=trusted_keys, release_kind="SYNTHETIC_FIXTURE"
    )
    assert [finding.severity for finding in findings] == ["INFO"]


def test_signed_at_is_outside_the_signed_bytes(bundle_factory, trusted_keys) -> None:
    """Documented consequence of excluding `signature`: signed_at is UNAUTHENTICATED metadata."""
    document = read_manifest(bundle_factory())
    document["signature"]["signed_at"] = "2099-12-31T23:59:59Z"
    assert _codes(verify_signature(document, public_keys=trusted_keys)) == [
        "SIGNATURE_SIGNER_DEVELOPMENT"
    ]


def test_sign_manifest_refuses_a_key_id_that_is_not_the_files_own(bundle_factory) -> None:
    bundle = bundle_factory(sign=False)
    from manifest import ReleaseManifest

    manifest = ReleaseManifest.from_dict(read_manifest(bundle))
    with pytest.raises(SigningKeyError) as error:
        sign_manifest(manifest, private_key_path=PRIVATE_KEYFILE, key_id="dev-someone-else")
    assert DEV_SIGNER_ID in str(error.value)


def test_sign_manifest_refuses_a_manifest_whose_digest_does_not_match(bundle_factory) -> None:
    from manifest import ReleaseManifest

    document = read_manifest(bundle_factory(sign=False))
    document["release_id"] = "rel-mutated-after-hashing"
    manifest = ReleaseManifest.from_dict(document)
    with pytest.raises(SigningKeyError) as error:
        sign_manifest(manifest, private_key_path=PRIVATE_KEYFILE, key_id=DEV_SIGNER_ID)
    assert "mutated after hashing" in str(error.value)


def test_sign_manifest_refuses_to_re_sign(bundle_factory) -> None:
    from manifest import ReleaseManifest

    manifest = ReleaseManifest.from_dict(read_manifest(bundle_factory()))
    with pytest.raises(SigningKeyError) as error:
        sign_manifest(manifest, private_key_path=PRIVATE_KEYFILE, key_id=DEV_SIGNER_ID)
    assert "already signed" in str(error.value)


def test_the_development_key_identity_is_marked(bundle_factory) -> None:
    key_id, seed = load_private_key(PRIVATE_KEYFILE)
    assert key_id.startswith(DEVELOPMENT_SIGNER_PREFIX)
    assert len(seed) == 32
    public_id, public_key = load_public_key(PUBLIC_KEYFILE)
    assert public_id == key_id and len(public_key) == 32


def test_a_pem_shaped_key_file_is_refused_naming_the_open_question(tmp_path: Path) -> None:
    """The header is assembled at runtime so this file never carries the literal (secret scan)."""
    header = "-" * 5 + "BEGIN " + "PRIVATE " + "KEY" + "-" * 5
    path = tmp_path / "operator.pem"
    path.write_text(f"{header}\nQUJD\n", encoding="utf-8")
    with pytest.raises(UnsupportedKeyFormat) as error:
        load_private_key(path)
    assert "Q-CRPS-3" in str(error.value)


def test_a_key_file_declaring_another_algorithm_is_refused(tmp_path: Path) -> None:
    path = tmp_path / "other.json"
    path.write_text(json.dumps({"key_id": "dev-x", "algorithm": "RSA", "seed_b64": ""}), encoding="utf-8")
    with pytest.raises(UnsupportedKeyFormat) as error:
        load_private_key(path)
    assert ALGORITHM in str(error.value)


def test_a_wrong_length_seed_is_refused_without_revealing_it(tmp_path: Path) -> None:
    secret = base64.b64encode(b"\xab" * 16).decode("ascii")
    path = tmp_path / "short.json"
    path.write_text(
        json.dumps({"key_id": "dev-x", "algorithm": ALGORITHM, "seed_b64": secret}), encoding="utf-8"
    )
    with pytest.raises(SigningKeyError) as error:
        load_private_key(path)
    message = str(error.value)
    assert "16 bytes" in message
    assert secret not in message


def test_the_environment_variable_carries_a_path_not_key_material(monkeypatch) -> None:
    monkeypatch.setenv(SIGNING_KEYFILE_ENV, str(PRIVATE_KEYFILE))
    key_id, seed = load_private_key()
    assert key_id == DEV_SIGNER_ID and len(seed) == 32


def test_an_unset_environment_variable_is_a_readable_error(monkeypatch) -> None:
    monkeypatch.delenv(SIGNING_KEYFILE_ENV, raising=False)
    with pytest.raises(SigningKeyError) as error:
        load_private_key()
    assert SIGNING_KEYFILE_ENV in str(error.value)


def test_public_keys_from_rejects_two_keys_claiming_one_identity(tmp_path: Path) -> None:
    other = tmp_path / "clash.json"
    other.write_text(
        json.dumps(
            {
                "key_id": DEV_SIGNER_ID,
                "algorithm": ALGORITHM,
                "public_key_b64": base64.b64encode(b"\x01" * 32).decode("ascii"),
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(SigningKeyError):
        public_keys_from(PUBLIC_KEYFILE, other)
