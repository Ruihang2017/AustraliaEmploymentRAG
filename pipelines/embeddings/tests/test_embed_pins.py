"""The manifest's members and pins (CRPS-05 acceptance items 3, 4, 5, 7; test plan step 4).

The required-member list is written out AS A LITERAL below. Deriving it from
`embedding-manifest.schema.json` — the thing this ticket must agree with — would prove only that
the emitted instance is self-consistent. CRPS-02's `test_schema_required_members.py` uses the same
discipline for the same reason, and this file copies it deliberately.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from embedding_fixtures import (
    MODEL_ARTEFACT_BYTES,
    TOKENIZER_ARTEFACT_BYTES,
    Artefacts,
    CorpusFixture,
    RecordingWriter,
)
from embeddings.build import build_embeddings
from embeddings.emit import MANIFEST_FILENAME
from embeddings.errors import ArtefactPinMismatch
from embeddings.profile import (
    EMBEDDING_BUILD_VERSION,
    PinnedProfile,
    fingerprint_of_manifest,
    profile_fingerprint,
    resolve_effective_profile,
)
from embeddings.provider import DeterministicStubProvider, LocalModelProvider

#: Deliverable 4, verbatim. Also `embedding-manifest.schema.json`'s `required` — asserted equal in
#: `test_embed_schema_conformance.py`, which is where the two lists are allowed to meet.
REQUIRED_MEMBERS = (
    "manifest_version",
    "profile_id",
    "model_id",
    "model_revision",
    "model_artifact",
    "licence",
    "tokenizer",
    "dimensions",
    "quantisation",
    "normalisation",
    "distance_metric",
    "runtime",
    "built_at",
    "builder_version",
    "input_contract_version",
    "tier_selection",
    "vector_file",
    "determinism",
    "source_release_id",
)

MODEL_ARTIFACT_MEMBERS = ("sha256", "byte_size", "format")
LICENCE_MEMBERS = (
    "identifier",
    "url",
    "attribution_required",
    "redistribution_permitted",
    "notes",
)
TOKENIZER_MEMBERS = ("id", "artifact_sha256", "max_tokens", "truncation")
RUNTIME_MEMBERS = (
    "family",
    "version",
    "execution_providers",
    "integration",
    "tokenizer_library",
    "pinned_by",
)
TIER_SELECTION_MEMBERS = ("tiers", "chunk_count", "embedded_count", "skipped_count")
VECTOR_FILE_MEMBERS = ("path", "sha256", "byte_size", "count")
DETERMINISM_MEMBERS = ("seed", "deterministic")


def stub_build(corpus: CorpusFixture, pinned: PinnedProfile, runtime, out: Path) -> dict:
    build_embeddings(
        corpus.path,
        pinned,
        DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions),
        runtime,
        out,
        writer=RecordingWriter(),
    )
    return json.loads((out / MANIFEST_FILENAME).read_text(encoding="utf-8"))


@pytest.fixture
def emitted(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> dict:
    return stub_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)


# ==================================================================================================
# Acceptance item 3 — every required member present
# ==================================================================================================


def test_every_required_member_is_present(emitted: dict) -> None:
    assert tuple(sorted(emitted)) == tuple(sorted(REQUIRED_MEMBERS))


@pytest.mark.parametrize(
    ("member", "expected"),
    [
        ("model_artifact", MODEL_ARTIFACT_MEMBERS),
        ("licence", LICENCE_MEMBERS),
        ("tokenizer", TOKENIZER_MEMBERS),
        ("runtime", RUNTIME_MEMBERS),
        ("tier_selection", TIER_SELECTION_MEMBERS),
        ("vector_file", VECTOR_FILE_MEMBERS),
        ("determinism", DETERMINISM_MEMBERS),
    ],
)
def test_nested_objects_carry_exactly_their_members(emitted: dict, member: str, expected) -> None:
    assert tuple(sorted(emitted[member])) == tuple(sorted(expected))


def test_crate_pins_are_present_inside_the_runtime(emitted: dict) -> None:
    for pin in ("integration", "tokenizer_library"):
        assert tuple(sorted(emitted["runtime"][pin])) == ("crate", "version")


def test_scalar_members_carry_the_expected_shapes(emitted: dict, pinned_profile: PinnedProfile) -> None:
    from contracts.version import CONTRACT_VERSION
    from manifest import MANIFEST_VERSION

    assert emitted["manifest_version"] == MANIFEST_VERSION
    assert emitted["builder_version"] == EMBEDDING_BUILD_VERSION
    assert emitted["input_contract_version"] == CONTRACT_VERSION
    assert emitted["profile_id"] == pinned_profile.profile.profile_id
    assert emitted["dimensions"] == pinned_profile.profile.dimensions
    assert emitted["quantisation"] == "none"
    assert emitted["normalisation"] == "l2"
    assert emitted["distance_metric"] == "cosine"
    assert emitted["tokenizer"]["truncation"] == "head"
    assert emitted["source_release_id"] is None
    assert emitted["built_at"].endswith("Z")


def test_the_source_release_id_is_recorded_when_supplied(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        DeterministicStubProvider(
            seed=pinned_profile.profile.seed, dimensions=pinned_profile.profile.dimensions
        ),
        runtime_pin_fixture,
        out_dir,
        writer=RecordingWriter(),
        source_release_id="rel_2026_07",
    )
    document = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    assert document["source_release_id"] == "rel_2026_07"


def test_hashes_are_lowercase_hex_and_counts_are_non_negative(emitted: dict) -> None:
    for digest in (
        emitted["model_artifact"]["sha256"],
        emitted["tokenizer"]["artifact_sha256"],
        emitted["vector_file"]["sha256"],
    ):
        assert len(digest) == 64 and digest == digest.lower()
        assert set(digest) <= set("0123456789abcdef")
    for count in ("chunk_count", "embedded_count", "skipped_count"):
        assert emitted["tier_selection"][count] >= 0
    assert emitted["vector_file"]["count"] >= 0
    assert emitted["dimensions"] >= 1


def test_the_runtime_pin_passes_through_untouched_except_the_stub_family(
    emitted: dict, runtime_pin_fixture
) -> None:
    """The stub family marker is the ONLY value this pipeline derives into a pin."""
    supplied = runtime_pin_fixture.to_dict()
    recorded = emitted["runtime"]
    assert recorded["family"] == f"stub:{supplied['family']}"
    for member in ("version", "execution_providers", "integration", "tokenizer_library", "pinned_by"):
        assert recorded[member] == supplied[member]


# ==================================================================================================
# Acceptance item 4 — the recorded hashes are the hashes of the files that were loaded
# ==================================================================================================


def test_local_provider_records_independently_hashed_artefacts(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    model_artefacts: Artefacts,
    runtime_pin_fixture,
    out_dir: Path,
) -> None:
    provider = LocalModelProvider(
        model_artefacts.model_path,
        model_artefacts.tokenizer_path,
        pinned_profile.model_artifact,
        pinned_profile.tokenizer_artifact_sha256,
        pinned_profile.profile,
        encoder=lambda texts: [[0.5] * pinned_profile.profile.dimensions for _ in texts],
    )
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        provider,
        runtime_pin_fixture,
        out_dir,
        writer=RecordingWriter(),
    )
    document = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))

    # Hashed here, in the test, from the fixture bytes — not read back out of the manifest.
    assert document["model_artifact"]["sha256"] == hashlib.sha256(MODEL_ARTEFACT_BYTES).hexdigest()
    assert document["model_artifact"]["byte_size"] == len(MODEL_ARTEFACT_BYTES)
    assert document["tokenizer"]["artifact_sha256"] == hashlib.sha256(
        TOKENIZER_ARTEFACT_BYTES
    ).hexdigest()
    # A local build is not a stub: the runtime family carries no marker.
    assert document["runtime"]["family"] == runtime_pin_fixture.family
    assert document["model_id"] == pinned_profile.profile.model_id


def test_a_declared_pin_that_disagrees_with_the_file_fails_the_build(
    pinned_profile: PinnedProfile, model_artefacts: Artefacts
) -> None:
    from embeddings.profile import ModelArtefactPin

    with pytest.raises(ArtefactPinMismatch):
        LocalModelProvider(
            model_artefacts.model_path,
            model_artefacts.tokenizer_path,
            ModelArtefactPin(sha256="f" * 64, byte_size=len(MODEL_ARTEFACT_BYTES), format="onnx"),
            pinned_profile.tokenizer_artifact_sha256,
            pinned_profile.profile,
        )


# ==================================================================================================
# Acceptance item 7 — a stub can never be mistaken for a promoted profile
# ==================================================================================================


def test_a_stub_build_is_identifiable_from_the_manifest_alone(
    emitted: dict, pinned_profile: PinnedProfile
) -> None:
    from manifest import is_stub

    assert emitted["model_id"] == f"stub:{pinned_profile.profile.seed}"
    # Asserted against CRPS-02's own predicate, which is what CRPS-06's candidate gate calls.
    assert is_stub(emitted["model_id"])
    assert emitted["runtime"]["family"].startswith("stub:")
    assert emitted["determinism"]["deterministic"] is True
    assert emitted["determinism"]["seed"] == pinned_profile.profile.seed
    assert emitted["model_artifact"]["format"] == "stub"


# ==================================================================================================
# The fingerprint round trip — why the manifest need not store one
# ==================================================================================================


def test_fingerprint_of_manifest_reproduces_the_effective_profiles_fingerprint(
    emitted: dict, pinned_profile: PinnedProfile
) -> None:
    provider = DeterministicStubProvider(
        seed=pinned_profile.profile.seed, dimensions=pinned_profile.profile.dimensions
    )
    effective = resolve_effective_profile(pinned_profile.profile, provider.describe())
    assert fingerprint_of_manifest(emitted) == profile_fingerprint(effective)


def test_fingerprint_of_manifest_reproduces_a_local_builds_fingerprint(
    corpus_fixture: CorpusFixture,
    pinned_profile: PinnedProfile,
    model_artefacts: Artefacts,
    runtime_pin_fixture,
    out_dir: Path,
) -> None:
    provider = LocalModelProvider(
        model_artefacts.model_path,
        model_artefacts.tokenizer_path,
        pinned_profile.model_artifact,
        pinned_profile.tokenizer_artifact_sha256,
        pinned_profile.profile,
        encoder=lambda texts: [[0.5] * pinned_profile.profile.dimensions for _ in texts],
    )
    build_embeddings(
        corpus_fixture.path,
        pinned_profile,
        provider,
        runtime_pin_fixture,
        out_dir,
        writer=RecordingWriter(),
    )
    document = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    assert fingerprint_of_manifest(document) == profile_fingerprint(pinned_profile.profile)


def test_fingerprint_of_manifest_refuses_an_incomplete_document(emitted: dict) -> None:
    broken = dict(emitted)
    broken.pop("distance_metric")
    with pytest.raises(ValueError):
        fingerprint_of_manifest(broken)
