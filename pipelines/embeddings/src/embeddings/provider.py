"""The embedding backend behind one interface (CRPS-05 deliverable 2).

TWO IMPLEMENTATIONS, NEITHER EVER SELECTED IMPLICITLY
------------------------------------------------------
The ticket's Reviewer-focus names the worst failure available in this pipeline: a silent stub
fallback, which would put unusable vectors inside a signed release. So there is no default provider
anywhere — `cli.py`'s `--provider` flag is required and defaultless, `build_embeddings()` takes the
provider as a positional argument, and `LocalModelProvider` raises `ProviderUnavailable` rather than
degrading. `tests/test_embed_source_scan.py` asserts statically that no `except ImportError` returns
a provider and that no `provider or DeterministicStubProvider(...)` construction exists.

WHY `embed()` RETURNS `tuple[array.array, ...]` AND NOT `np.ndarray`
--------------------------------------------------------------------
The ticket types deliverable 2 as `-> np.ndarray`. numpy is declared in this member's
`pyproject.toml` but is not installed by `uv sync --frozen` in this repository's virtual-root uv
layout (the gap FND-01 owns), so a numpy-typed signature would make the entire provider layer
untestable. `array.array("f")` is IEEE-754 binary32 — exactly float32 — so nothing about
determinism or byte-equality changes, and `np.frombuffer` reads it zero-copy inside `vectors.py`,
the one module where numpy is genuinely required. Recorded as a writeback candidate; semantically
the two are identical.

DETERMINISM
-----------
`DeterministicStubProvider` uses `hashlib` only. It must never use `random`, `hash()` (which is
PYTHONHASHSEED-dependent — a classic silent nondeterminism that an in-process test cannot catch),
`id()`, or any clock. `tests/test_embed_determinism.py` compares its output across separate OS
processes for exactly that reason.
"""

from __future__ import annotations

import array
import hashlib
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Literal, Protocol, Sequence, runtime_checkable

from .errors import ArtefactPinMismatch, ProviderUnavailable
from .profile import EmbeddingProfile, ModelArtefactPin

__all__ = [
    "DeterministicStubProvider",
    "EmbeddingProvider",
    "LocalModelProvider",
    "ProviderInfo",
    "VectorBatch",
    "normalise_vector",
    "sha256_of_file",
]

#: One `array("f")` of length `dimensions` per input text. See the module docstring.
VectorBatch = tuple["array.array[float]", ...]


@dataclass(frozen=True)
class ProviderInfo:
    """What ACTUALLY ran — never what was requested.

    That distinction is the whole point of the type: the manifest records the artefact the
    provider really loaded and the tokenizer it really used, so breakdown plan §8 Q11's pins
    describe the build rather than the build request.
    """

    kind: Literal["local", "stub"]
    model_artefact: ModelArtefactPin
    tokenizer_artifact_sha256: str
    model_id: str
    model_revision: str
    runtime_family_marker: str | None


@runtime_checkable
class EmbeddingProvider(Protocol):
    """Deliverable 2's interface."""

    def embed(self, texts: Sequence[str]) -> VectorBatch: ...

    def describe(self) -> ProviderInfo: ...


def sha256_of_file(path: Path) -> tuple[str, int]:
    """Lowercase-hex SHA-256 and byte size of *path*, read in bounded chunks."""
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            block = handle.read(1 << 20)
            if not block:
                break
            digest.update(block)
            size += len(block)
    return digest.hexdigest(), size


def normalise_vector(values: Sequence[float], normalisation: str) -> "array.array[float]":
    """Apply the profile's normalisation, computing in float64 and storing float32.

    Computing the norm in float32 would make the result depend on summation order in a way that is
    invisible until two platforms disagree; float64 accumulation followed by a single float32 store
    is reproducible.
    """
    if normalisation == "none":
        return array.array("f", values)
    if normalisation != "l2":
        raise ValueError(f"unsupported normalisation {normalisation!r}")
    norm = math.sqrt(math.fsum(float(value) * float(value) for value in values))
    if norm == 0.0:
        # An all-zero vector has no direction to preserve. Returning it unchanged is the only
        # option that is not a silent invention of one.
        return array.array("f", values)
    return array.array("f", [float(value) / norm for value in values])


class DeterministicStubProvider:
    """A seeded, hash-based pseudo-embedding for CI and CRPS-08's fixture path.

    `describe()` reports `kind="stub"` and `model_id=f"stub:{seed}"`, which `manifest.is_stub()`
    recognises — so CRPS-06's candidate gate can reject a stub-built index from the manifest alone
    (CRPS-02 deliverable 13). A stub is not a defect; a stub indistinguishable from a real profile
    would be.
    """

    #: Domain separation, so a stub vector can never coincide with some other hash-derived value.
    _PERSON = b"taxrag-embed"

    def __init__(self, seed: int, dimensions: int, *, normalisation: str = "l2") -> None:
        if dimensions < 1:
            raise ValueError(f"dimensions must be >= 1, got {dimensions}")
        self._seed = seed
        self._dimensions = dimensions
        self._normalisation = normalisation

    @property
    def seed(self) -> int:
        return self._seed

    def _raw(self, text: str) -> list[float]:
        """`dimensions` float values in [-1, 1), derived only from the seed and the text."""
        values: list[float] = []
        counter = 0
        material = f"{self._seed}:{text}".encode("utf-8")
        while len(values) < self._dimensions:
            block = hashlib.blake2b(
                material + counter.to_bytes(8, "big"), digest_size=64, person=self._PERSON
            ).digest()
            for offset in range(0, len(block), 4):
                if len(values) >= self._dimensions:
                    break
                word = int.from_bytes(block[offset : offset + 4], "big")
                # Map [0, 2**32) onto [-1, 1) exactly, with no floating-point rounding surprises:
                # the division is by a power of two, so it is exact in binary64.
                values.append(word / 2147483648.0 - 1.0)
            counter += 1
        return values

    def embed(self, texts: Sequence[str]) -> VectorBatch:
        return tuple(normalise_vector(self._raw(text), self._normalisation) for text in texts)

    def describe(self) -> ProviderInfo:
        # A synthetic artefact pin whose digest covers the stub's OWN parameters: two stubs with
        # different seeds or dimensions must not claim the same artefact identity.
        parameters = f"stub/{self._seed}/{self._dimensions}/{self._normalisation}".encode("utf-8")
        digest = hashlib.sha256(parameters).hexdigest()
        return ProviderInfo(
            kind="stub",
            model_artefact=ModelArtefactPin(sha256=digest, byte_size=len(parameters), format="stub"),
            tokenizer_artifact_sha256=hashlib.sha256(b"stub-tokenizer/" + parameters).hexdigest(),
            model_id=f"stub:{self._seed}",
            model_revision=f"stub:{digest[:16]}",
            runtime_family_marker="stub",
        )


class LocalModelProvider:
    """A pinned, locally-available model loaded from an explicit filesystem path.

    NO network fetch and NO model-hub lookup of any kind (PRD §19.3, §20.3; breakdown plan §8 Q11):
    the artefact is a path, never an id to be resolved. Both files are hashed and compared with the
    declared pin BEFORE anything is loaded — an artefact that is not the pinned one must never
    produce a vector.

    Model execution itself is out of scope for this ticket (Q11/RETR-07 owns the runtime, Q2/GOLD-15
    owns the weights), so `embed()` delegates to an INJECTED encoder callable. That is what makes
    acceptance item 4 — "the recorded hashes are the hashes of the files actually loaded, and a
    declared pin that disagrees fails the build" — testable today, which is the part of deliverable
    2 this ticket actually delivers. With no encoder supplied, `embed()` raises
    `ProviderUnavailable` naming its owners; it NEVER falls back to the stub.
    """

    def __init__(
        self,
        artefact_path: Path,
        tokenizer_path: Path,
        declared_pin: ModelArtefactPin,
        declared_tokenizer_sha256: str,
        profile: EmbeddingProfile,
        *,
        encoder: Callable[[Sequence[str]], Sequence[Sequence[float]]] | None = None,
    ) -> None:
        self._profile = profile
        self._encoder = encoder

        for path, label in ((artefact_path, "model artefact"), (tokenizer_path, "tokenizer.json")):
            if not path.is_file():
                raise ProviderUnavailable(
                    f"{label} not found at {path}. LocalModelProvider loads a pinned LOCAL file "
                    "and never resolves a model-hub id (breakdown plan §8 Q11); it also never "
                    "falls back to DeterministicStubProvider."
                )

        artefact_sha256, artefact_size = sha256_of_file(artefact_path)
        if artefact_sha256 != declared_pin.sha256:
            raise ArtefactPinMismatch(
                f"model artefact at {artefact_path} hashes to {artefact_sha256}, but the declared "
                f"pin says {declared_pin.sha256}. Breakdown plan §8 Q11 pins the artefact by hash "
                "so RETR-07 can verify it before first use; a disagreement is blocking."
            )
        if artefact_size != declared_pin.byte_size:
            raise ArtefactPinMismatch(
                f"model artefact at {artefact_path} is {artefact_size} bytes, but the declared pin "
                f"says {declared_pin.byte_size}."
            )

        tokenizer_sha256, _ = sha256_of_file(tokenizer_path)
        if tokenizer_sha256 != declared_tokenizer_sha256:
            raise ArtefactPinMismatch(
                f"tokenizer.json at {tokenizer_path} hashes to {tokenizer_sha256}, but the "
                f"declared pin says {declared_tokenizer_sha256}. Q11 pins a local tokenizer.json "
                "by the release; a disagreement is blocking."
            )

        self._artefact_pin = ModelArtefactPin(
            sha256=artefact_sha256, byte_size=artefact_size, format=declared_pin.format
        )
        self._tokenizer_sha256 = tokenizer_sha256

    def embed(self, texts: Sequence[str]) -> VectorBatch:
        if self._encoder is None:
            raise ProviderUnavailable(
                "LocalModelProvider has no encoder: this ticket pins and verifies model artefacts "
                "but loads no model runtime. The runtime is RETR-07's (breakdown plan §8 Q11) and "
                "the weights are GOLD-15's (Q2). Supply an encoder explicitly — there is "
                "deliberately no fallback to DeterministicStubProvider."
            )
        produced = self._encoder(texts)
        if len(produced) != len(texts):
            raise ProviderUnavailable(
                f"encoder returned {len(produced)} vectors for {len(texts)} texts"
            )
        vectors: list["array.array[float]"] = []
        for index, values in enumerate(produced):
            if len(values) != self._profile.dimensions:
                raise ProviderUnavailable(
                    f"encoder returned {len(values)} components for text {index}, but the profile "
                    f"declares dimensions={self._profile.dimensions}"
                )
            vectors.append(normalise_vector(values, self._profile.normalisation))
        return tuple(vectors)

    def describe(self) -> ProviderInfo:
        return ProviderInfo(
            kind="local",
            model_artefact=self._artefact_pin,
            tokenizer_artifact_sha256=self._tokenizer_sha256,
            model_id=self._profile.model_id,
            model_revision=self._profile.model_revision,
            runtime_family_marker=None,
        )
