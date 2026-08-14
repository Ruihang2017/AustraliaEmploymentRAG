"""The profile, its fingerprint and the runtime pin (CRPS-05 deliverable 1).

Acceptance item 5 lives here in part: "a missing or incomplete `RuntimePin` fails the build with a
typed error naming the field". The parametrisation below removes each of the six members and each
of the two crate-pin members individually, so an error that named only "runtime" would fail.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from embedding_fixtures import RUNTIME_PIN_DOCUMENT, make_profile
from embeddings.errors import MissingRuntimePin
from embeddings.profile import (
    EMBEDDING_BUILD_VERSION,
    FINGERPRINT_MEMBERS,
    EmbeddingProfile,
    PinnedProfile,
    load_runtime_pin,
    profile_fingerprint,
    runtime_pin_from_dict,
)


def test_fingerprint_is_stable_lowercase_hex_sha256(stub_profile: EmbeddingProfile) -> None:
    digest = profile_fingerprint(stub_profile)
    assert len(digest) == 64
    assert digest == digest.lower()
    assert set(digest) <= set("0123456789abcdef")
    assert digest == profile_fingerprint(make_profile())


@pytest.mark.parametrize("member", FINGERPRINT_MEMBERS)
def test_every_representation_member_moves_the_fingerprint(member: str) -> None:
    """A member listed as fingerprinted that did not change the digest would be a silent lie."""
    changed = {
        "dimensions": 16,
        "distance_metric": "l2",
        "max_tokens": 128,
        "model_id": "fixture/other-embedder",
        "model_revision": "1" * 40,
        "normalisation": "none",
        "profile_id": "embed-fixture-v2",
        "quantisation": "int8",
        "tokenizer_id": "fixture/other-tokenizer",
        "truncation": "tail",
    }[member]
    assert profile_fingerprint(make_profile(**{member: changed})) != profile_fingerprint(make_profile())


@pytest.mark.parametrize(("member", "value"), [("batch_size", 64), ("seed", 7)])
def test_operational_members_are_excluded_from_the_fingerprint(member: str, value: int) -> None:
    """`batch_size` cannot move a vector, and `seed` is recorded as `determinism.seed` instead.

    The ticket fixes the fingerprint's meaning as "the same representation" because RETR-05 and
    RETR-07 compare it at the index boundary; a batch-size change must not read as a profile
    change there.
    """
    assert profile_fingerprint(make_profile(**{member: value})) == profile_fingerprint(make_profile())


def test_fingerprint_member_list_is_the_ticket_list() -> None:
    """Written out literally: deriving it from the dataclass would prove only self-consistency."""
    assert FINGERPRINT_MEMBERS == (
        "dimensions",
        "distance_metric",
        "max_tokens",
        "model_id",
        "model_revision",
        "normalisation",
        "profile_id",
        "quantisation",
        "tokenizer_id",
        "truncation",
    )


def test_profile_rejects_a_dimensionless_or_unbatchable_profile() -> None:
    for bad in ({"dimensions": 0}, {"batch_size": 0}, {"max_tokens": 0}):
        with pytest.raises(ValueError):
            make_profile(**bad)


def test_embedding_build_version_is_published_semver() -> None:
    parts = EMBEDDING_BUILD_VERSION.split(".")
    assert len(parts) == 3 and all(part.isdigit() for part in parts)


def test_pinned_profile_round_trips_through_json(pinned_profile: PinnedProfile, tmp_path: Path) -> None:
    path = tmp_path / "profile.json"
    path.write_text(json.dumps(pinned_profile.to_json(), indent=2), encoding="utf-8")
    assert PinnedProfile.load(path) == pinned_profile


# ==================================================================================================
# The runtime pin — acceptance item 5
# ==================================================================================================


def test_complete_runtime_pin_builds_the_crps02_dataclass() -> None:
    pin = runtime_pin_from_dict(dict(RUNTIME_PIN_DOCUMENT))
    assert pin.family == "onnxruntime"
    assert pin.execution_providers == ("CPUExecutionProvider",)
    assert pin.integration.crate == "ort"
    assert pin.tokenizer_library.crate == "tokenizers"
    assert pin.pinned_by == "RETR-07"
    # It IS CRPS-02's dataclass, not a second local declaration (ticket deliverable 1).
    from manifest import RuntimePin

    assert isinstance(pin, RuntimePin)


def test_absent_runtime_pin_names_the_field() -> None:
    with pytest.raises(MissingRuntimePin) as excinfo:
        runtime_pin_from_dict(None)
    assert "runtime" in str(excinfo.value)


@pytest.mark.parametrize(
    "member", ["family", "version", "pinned_by", "execution_providers", "integration", "tokenizer_library"]
)
def test_each_missing_runtime_member_is_named(member: str) -> None:
    document = {key: value for key, value in RUNTIME_PIN_DOCUMENT.items() if key != member}
    with pytest.raises(MissingRuntimePin) as excinfo:
        runtime_pin_from_dict(document)
    assert member in str(excinfo.value)


@pytest.mark.parametrize("pin_name", ["integration", "tokenizer_library"])
@pytest.mark.parametrize("member", ["crate", "version"])
def test_each_missing_crate_pin_member_is_named(pin_name: str, member: str) -> None:
    document = json.loads(json.dumps(RUNTIME_PIN_DOCUMENT))
    del document[pin_name][member]
    with pytest.raises(MissingRuntimePin) as excinfo:
        runtime_pin_from_dict(document)
    assert f"{pin_name}.{member}" in str(excinfo.value)


@pytest.mark.parametrize("member", ["family", "version", "pinned_by"])
def test_empty_runtime_member_is_rejected_not_defaulted(member: str) -> None:
    document = dict(RUNTIME_PIN_DOCUMENT) | {member: "   "}
    with pytest.raises(MissingRuntimePin) as excinfo:
        runtime_pin_from_dict(document)
    assert member in str(excinfo.value)


def test_empty_execution_provider_list_is_rejected() -> None:
    with pytest.raises(MissingRuntimePin):
        runtime_pin_from_dict(dict(RUNTIME_PIN_DOCUMENT) | {"execution_providers": []})


def test_load_runtime_pin_reads_a_file_and_reports_an_absent_one(tmp_path: Path) -> None:
    path = tmp_path / "runtime.json"
    path.write_text(json.dumps(RUNTIME_PIN_DOCUMENT), encoding="utf-8")
    assert load_runtime_pin(path).family == "onnxruntime"

    with pytest.raises(MissingRuntimePin):
        load_runtime_pin(tmp_path / "absent.json")

    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    with pytest.raises(MissingRuntimePin):
        load_runtime_pin(broken)
