"""The two providers (CRPS-05 deliverable 2), and the artefact-pin check acceptance item 4 needs.

The stub's cross-process determinism is asserted in `test_embed_determinism.py`, where the
subprocess machinery lives.
"""

from __future__ import annotations

import array
import math
from pathlib import Path

import pytest

from embedding_fixtures import Artefacts, make_profile
from embeddings.errors import ArtefactPinMismatch, ProviderUnavailable
from embeddings.profile import EmbeddingProfile, ModelArtefactPin, resolve_effective_profile
from embeddings.provider import (
    DeterministicStubProvider,
    EmbeddingProvider,
    LocalModelProvider,
    normalise_vector,
)


# ==================================================================================================
# DeterministicStubProvider
# ==================================================================================================


def test_stub_satisfies_the_provider_protocol() -> None:
    assert isinstance(DeterministicStubProvider(seed=1, dimensions=8), EmbeddingProvider)


def test_stub_is_deterministic_in_process_and_shaped_by_the_profile() -> None:
    first = DeterministicStubProvider(seed=42, dimensions=8).embed(["alpha", "beta"])
    second = DeterministicStubProvider(seed=42, dimensions=8).embed(["alpha", "beta"])
    assert [tuple(v) for v in first] == [tuple(v) for v in second]
    assert all(isinstance(v, array.array) and v.typecode == "f" and len(v) == 8 for v in first)


def test_stub_output_depends_on_seed_and_on_text() -> None:
    base = DeterministicStubProvider(seed=42, dimensions=8).embed(["alpha"])[0]
    assert tuple(DeterministicStubProvider(seed=43, dimensions=8).embed(["alpha"])[0]) != tuple(base)
    assert tuple(DeterministicStubProvider(seed=42, dimensions=8).embed(["gamma"])[0]) != tuple(base)


def test_stub_l2_normalises() -> None:
    vector = DeterministicStubProvider(seed=42, dimensions=16, normalisation="l2").embed(["alpha"])[0]
    assert math.isclose(math.sqrt(sum(float(v) * float(v) for v in vector)), 1.0, rel_tol=1e-6)


def test_stub_without_normalisation_leaves_the_raw_range() -> None:
    vector = DeterministicStubProvider(seed=42, dimensions=16, normalisation="none").embed(["alpha"])[0]
    assert all(-1.0 <= float(value) < 1.0 for value in vector)


def test_stub_handles_empty_and_non_ascii_text() -> None:
    vectors = DeterministicStubProvider(seed=42, dimensions=8).embed(["", "révolues 𝕏"])
    assert len(vectors) == 2 and all(len(v) == 8 for v in vectors)


def test_stub_describes_itself_as_a_stub_that_crps02_can_recognise() -> None:
    info = DeterministicStubProvider(seed=7, dimensions=8).describe()
    from manifest import is_stub

    assert info.kind == "stub"
    assert info.model_id == "stub:7"
    # Asserted against CRPS-02's own predicate, not a local re-spelling of the prefix.
    assert is_stub(info.model_id)
    assert info.model_artefact.format == "stub"
    assert info.runtime_family_marker == "stub"


def test_stub_artefact_pin_covers_the_stubs_own_parameters() -> None:
    """Two stubs that would produce different vectors must not claim one artefact identity."""
    a = DeterministicStubProvider(seed=7, dimensions=8).describe().model_artefact.sha256
    b = DeterministicStubProvider(seed=8, dimensions=8).describe().model_artefact.sha256
    c = DeterministicStubProvider(seed=7, dimensions=16).describe().model_artefact.sha256
    assert len({a, b, c}) == 3


def test_resolve_effective_profile_records_what_ran() -> None:
    profile = make_profile()
    info = DeterministicStubProvider(seed=profile.seed, dimensions=profile.dimensions).describe()
    effective = resolve_effective_profile(profile, info)
    assert effective.model_id == f"stub:{profile.seed}"
    assert effective.model_revision == info.model_revision
    # Everything else is untouched — the provider reports identity, not representation.
    assert effective.dimensions == profile.dimensions
    assert effective.profile_id == profile.profile_id


def test_stub_rejects_a_dimensionless_request() -> None:
    with pytest.raises(ValueError):
        DeterministicStubProvider(seed=1, dimensions=0)


# ==================================================================================================
# normalise_vector
# ==================================================================================================


def test_normalise_vector_leaves_an_all_zero_vector_alone() -> None:
    """There is no direction to preserve; inventing one would be worse than keeping the zero."""
    assert list(normalise_vector([0.0, 0.0, 0.0], "l2")) == [0.0, 0.0, 0.0]


def test_normalise_vector_rejects_an_unknown_scheme() -> None:
    with pytest.raises(ValueError):
        normalise_vector([1.0], "unit-sphere")


# ==================================================================================================
# LocalModelProvider — acceptance item 4
# ==================================================================================================


def _local(
    artefacts: Artefacts,
    profile: EmbeddingProfile,
    *,
    pin: ModelArtefactPin | None = None,
    tokenizer_sha256: str | None = None,
    encoder=None,
) -> LocalModelProvider:
    return LocalModelProvider(
        artefacts.model_path,
        artefacts.tokenizer_path,
        pin or artefacts.model_pin,
        tokenizer_sha256 or artefacts.tokenizer_sha256,
        profile,
        encoder=encoder,
    )


def test_local_provider_records_the_hashes_of_the_files_it_loaded(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    info = _local(model_artefacts, stub_profile).describe()
    assert info.kind == "local"
    assert info.model_artefact.sha256 == model_artefacts.model_pin.sha256
    assert info.model_artefact.byte_size == model_artefacts.model_pin.byte_size
    assert info.tokenizer_artifact_sha256 == model_artefacts.tokenizer_sha256
    assert info.runtime_family_marker is None


def test_a_wrong_declared_model_hash_is_blocking(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    wrong = ModelArtefactPin(sha256="b" * 64, byte_size=model_artefacts.model_pin.byte_size, format="onnx")
    with pytest.raises(ArtefactPinMismatch) as excinfo:
        _local(model_artefacts, stub_profile, pin=wrong)
    assert "b" * 64 in str(excinfo.value)


def test_a_wrong_declared_byte_size_is_blocking(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    wrong = ModelArtefactPin(sha256=model_artefacts.model_pin.sha256, byte_size=1, format="onnx")
    with pytest.raises(ArtefactPinMismatch):
        _local(model_artefacts, stub_profile, pin=wrong)


def test_a_wrong_declared_tokenizer_hash_is_blocking(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    with pytest.raises(ArtefactPinMismatch) as excinfo:
        _local(model_artefacts, stub_profile, tokenizer_sha256="c" * 64)
    assert "tokenizer" in str(excinfo.value)


def test_an_absent_artefact_never_degrades_to_the_stub(
    tmp_path: Path, model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    with pytest.raises(ProviderUnavailable):
        LocalModelProvider(
            tmp_path / "absent.onnx",
            model_artefacts.tokenizer_path,
            model_artefacts.model_pin,
            model_artefacts.tokenizer_sha256,
            stub_profile,
        )


def test_local_provider_without_an_encoder_refuses_rather_than_falling_back(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    provider = _local(model_artefacts, stub_profile)
    with pytest.raises(ProviderUnavailable) as excinfo:
        provider.embed(["alpha"])
    message = str(excinfo.value)
    assert "RETR-07" in message and "GOLD-15" in message


def test_local_provider_normalises_and_shape_checks_the_injected_encoder(
    model_artefacts: Artefacts, stub_profile: EmbeddingProfile
) -> None:
    provider = _local(
        model_artefacts,
        stub_profile,
        encoder=lambda texts: [[float(index + 1)] * stub_profile.dimensions for index, _ in enumerate(texts)],
    )
    vectors = provider.embed(["alpha", "beta"])
    assert len(vectors) == 2
    for vector in vectors:
        assert math.isclose(math.sqrt(sum(float(v) * float(v) for v in vector)), 1.0, rel_tol=1e-6)

    wrong_width = _local(model_artefacts, stub_profile, encoder=lambda texts: [[1.0] for _ in texts])
    with pytest.raises(ProviderUnavailable):
        wrong_width.embed(["alpha"])

    wrong_count = _local(model_artefacts, stub_profile, encoder=lambda texts: [])
    with pytest.raises(ProviderUnavailable):
        wrong_count.embed(["alpha"])
