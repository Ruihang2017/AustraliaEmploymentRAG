"""Acceptance item 3 — canonicalisation is byte-stable, and every rule that makes it so."""

from __future__ import annotations

import hashlib

import pytest
from manifest_fixtures import read_manifest

from manifest.canonical import (
    CANONICAL_EXCLUDED,
    NonCanonicalValue,
    canonical_bytes,
    canonical_value,
    manifest_sha256,
)


def test_key_insertion_order_does_not_change_the_bytes() -> None:
    forwards = {"a": 1, "b": {"x": 1, "y": 2}, "c": [1, 2]}
    backwards = {"c": [1, 2], "b": {"y": 2, "x": 1}, "a": 1}
    assert canonical_bytes(forwards) == canonical_bytes(backwards)
    assert manifest_sha256(forwards) == manifest_sha256(backwards)


def test_keys_are_sorted_by_code_point() -> None:
    assert canonical_bytes({"b": 1, "A": 2, "a": 3}) == b'{"A":2,"a":3,"b":1}'


def test_the_two_excluded_members_never_reach_the_signed_bytes() -> None:
    with_signature = {
        "release_id": "r",
        "signature": {"algorithm": "ED25519"},
        "manifest_sha256": "f" * 64,
    }
    assert canonical_bytes(with_signature) == b'{"release_id":"r"}'
    assert CANONICAL_EXCLUDED == ("signature", "manifest_sha256")


def test_a_signature_change_does_not_change_the_digest(bundle_factory) -> None:
    """The whole reason for the exclusion: otherwise verification would be circular."""
    document = read_manifest(bundle_factory())
    before = manifest_sha256(document)
    document["signature"]["signed_at"] = "2099-01-01T00:00:00Z"
    document["manifest_sha256"] = "0" * 64
    assert manifest_sha256(document) == before


def test_a_float_is_refused() -> None:
    with pytest.raises(NonCanonicalValue) as error:
        canonical_bytes({"metric": 0.87})
    assert "float" in str(error.value)


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf")])
def test_nan_and_infinity_are_refused(value: float) -> None:
    with pytest.raises(NonCanonicalValue):
        canonical_bytes({"metric": value})


def test_a_non_ascii_key_is_refused() -> None:
    """Code-point ordering and RFC 8785's UTF-16 ordering diverge outside the BMP."""
    with pytest.raises(NonCanonicalValue) as error:
        canonical_bytes({"café": 1})
    assert "ASCII" in str(error.value)


def test_a_non_ascii_string_value_is_allowed_and_not_escaped() -> None:
    assert canonical_bytes({"note": "café"}) == '{"note":"café"}'.encode("utf-8")


def test_booleans_are_not_serialised_as_integers() -> None:
    assert canonical_bytes({"a": True, "b": False, "c": 1, "d": 0}) == b'{"a":true,"b":false,"c":1,"d":0}'


def test_a_foreign_type_is_refused() -> None:
    with pytest.raises(NonCanonicalValue) as error:
        canonical_bytes({"when": object()})
    assert "not a JSON type" in str(error.value)


def test_control_characters_are_escaped() -> None:
    assert canonical_value("a\nb\tc\x01") == '"a\\nb\\tc\\u0001"'


def test_nested_objects_are_sorted_at_every_level() -> None:
    assert canonical_bytes({"z": {"b": {"y": 1, "a": 2}}}) == b'{"z":{"b":{"a":2,"y":1}}}'


def test_arrays_keep_their_order() -> None:
    assert canonical_bytes({"a": [3, 1, 2]}) == b'{"a":[3,1,2]}'


def test_manifest_sha256_is_the_digest_of_the_canonical_bytes(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    expected = hashlib.sha256(canonical_bytes(document)).hexdigest()
    assert document["manifest_sha256"] == expected == manifest_sha256(document)


def test_canonical_value_excludes_nothing() -> None:
    """The member-level serialiser must NOT inherit the manifest-level exclusions."""
    assert canonical_value({"signature": 1, "manifest_sha256": 2}) == '{"manifest_sha256":2,"signature":1}'
