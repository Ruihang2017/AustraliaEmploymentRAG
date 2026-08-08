"""The profile, its fingerprint, and the `SearchChunkDraft` field set (CRPS-03 acceptance 9, 10)."""

from __future__ import annotations

import dataclasses
import re

import pytest

from chunking import (
    CHUNKER_VERSION,
    DEFAULT_PROFILE,
    SEGMENTER_VERSION,
    ChunkProfile,
    SearchChunkDraft,
    profile_fingerprint,
)

SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def test_versions_are_semver() -> None:
    assert SEMVER.match(CHUNKER_VERSION), CHUNKER_VERSION
    assert SEMVER.match(SEGMENTER_VERSION), SEGMENTER_VERSION


def test_default_profile_holds_the_documented_defaults() -> None:
    """Deliverable 4's exact six values. Changing one is a writeback, not a code edit."""
    assert DEFAULT_PROFILE.profile_id == "chunk-default-v1"
    assert DEFAULT_PROFILE.target_chars == 1200
    assert DEFAULT_PROFILE.max_chars == 2000
    assert DEFAULT_PROFILE.min_chars == 200
    assert DEFAULT_PROFILE.overlap_chars == 0
    assert DEFAULT_PROFILE.split_strategy == "sentence"
    assert DEFAULT_PROFILE.consolidate_within_provision is True


def test_fingerprint_is_stable_64_hex() -> None:
    first = profile_fingerprint(DEFAULT_PROFILE)
    assert HEX64.match(first), first
    assert first == profile_fingerprint(DEFAULT_PROFILE)


@pytest.mark.parametrize(
    ("member", "value"),
    [
        ("profile_id", "chunk-other-v1"),
        ("target_chars", 1201),
        ("max_chars", 2001),
        ("min_chars", 201),
        ("overlap_chars", 1),
        ("consolidate_within_provision", False),
        ("split_strategy", "paragraph"),
    ],
)
def test_every_profile_member_moves_the_fingerprint(member: str, value: object) -> None:
    """Acceptance item 10: changing ANY profile constant changes the fingerprint."""
    mutated = dataclasses.replace(DEFAULT_PROFILE, **{member: value})
    assert getattr(mutated, member) != getattr(DEFAULT_PROFILE, member)
    assert profile_fingerprint(mutated) != profile_fingerprint(DEFAULT_PROFILE)


def test_fingerprint_covers_the_component_versions() -> None:
    """The chunker and segmenter versions are inside the hashed document, not beside it."""
    from chunking import profile as profile_module

    baseline = profile_fingerprint(DEFAULT_PROFILE)
    original = profile_module.CHUNKER_VERSION
    try:
        profile_module.CHUNKER_VERSION = "9.9.9"
        assert profile_fingerprint(DEFAULT_PROFILE) != baseline
    finally:
        profile_module.CHUNKER_VERSION = original
    assert profile_fingerprint(DEFAULT_PROFILE) == baseline


def test_search_chunk_draft_field_set_is_exactly_the_eight_members() -> None:
    """Acceptance item 9: no `index_tier`, so the CRPS-03 / CRPS-04 boundary cannot erode."""
    names = [field.name for field in dataclasses.fields(SearchChunkDraft)]
    assert names == [
        "node_version_id",
        "chunk_ordinal",
        "start_offset",
        "end_offset",
        "text_hash",
        "char_count",
        "consolidated_node_version_ids",
        "profile_id",
    ]
    assert "index_tier" not in names


@pytest.mark.parametrize(
    "kwargs",
    [
        {"profile_id": ""},
        {"min_chars": 0},
        {"min_chars": 3000},  # min > target
        {"max_chars": 500},  # max < target
        {"overlap_chars": 200},  # overlap == min_chars
        {"overlap_chars": -1},
        {"split_strategy": "word"},
    ],
)
def test_invalid_profiles_fail_at_construction(kwargs: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        dataclasses.replace(DEFAULT_PROFILE, **kwargs)


def test_profile_is_frozen() -> None:
    with pytest.raises(dataclasses.FrozenInstanceError):
        DEFAULT_PROFILE.max_chars = 10  # type: ignore[misc]


def test_a_valid_alternative_profile_is_accepted() -> None:
    profile = ChunkProfile(
        profile_id="chunk-tiny-v1",
        target_chars=40,
        max_chars=60,
        min_chars=20,
        overlap_chars=0,
        consolidate_within_provision=False,
        split_strategy="hard",
    )
    assert profile_fingerprint(profile) != profile_fingerprint(DEFAULT_PROFILE)
