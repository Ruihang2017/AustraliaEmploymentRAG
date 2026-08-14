"""The pinned embedding profile and the pins that travel with it (CRPS-05 deliverable 1).

WHAT IS FINGERPRINTED, AND WHY THE LINE IS DRAWN WHERE IT IS
------------------------------------------------------------
`profile_fingerprint()` covers exactly the REPRESENTATION members — the ones that change what a
vector means:

    profile_id, model_id, model_revision, tokenizer_id, max_tokens, truncation,
    dimensions, quantisation, normalisation, distance_metric

It deliberately EXCLUDES:

* `batch_size` — an operational knob that cannot move a vector. Fingerprinting it would make a
  resumed run with a different batch size look like a different representation.
* `seed` — recorded in the manifest as `determinism.seed`, but two profiles differing only in seed
  are still the same representation contract; the vectors differ, and the vector file's own sha256
  is what proves that.
* the artefact hashes and the runtime — the ticket is explicit that those are "recorded and
  verified, not fingerprinted", so a query-side artefact exported differently from the build-side
  artefact produces a clear `ModelArtefactMismatch` rather than a confusing fingerprint mismatch.
  RETR-05/RETR-07 compare this fingerprint at the index boundary, so it must keep meaning "the same
  representation", not "the same file on disk".

The digest is taken over a canonical `key=value\\n` join sorted by key, behind a version prefix —
never `repr()` or `dataclasses.asdict()` iteration order, either of which would silently change
meaning if a member were reordered.

`fingerprint_of_manifest()` recomputes the same digest from an emitted `embedding-manifest.json`.
That is what makes the deliverable-6 compatibility guard possible WITHOUT storing the fingerprint
in the manifest — `embedding-manifest.schema.json` is `additionalProperties: false` at every level
and has no member for it, so the schema wins (ticket Feedback obligation) and the fingerprint is
recomputed instead. `tests/test_embed_pins.py` asserts the round trip, which is what stops the two
member lists drifting apart.

This module is stdlib-only. It never reads `Cargo.toml`, `Cargo.lock`, `uv.lock`, `os.environ`,
`importlib.metadata` or an installed package version — asserted statically by
`tests/test_embed_source_scan.py`.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Literal, Mapping

from ._bootstrap import load_manifest
from .errors import MissingRuntimePin

__all__ = [
    "EMBEDDING_BUILD_VERSION",
    "FINGERPRINT_MEMBERS",
    "EmbeddingProfile",
    "LicencePin",
    "ModelArtefactPin",
    "PinnedProfile",
    "fingerprint_of_manifest",
    "load_runtime_pin",
    "profile_fingerprint",
    "resolve_effective_profile",
    "runtime_pin_from_dict",
]

#: Published as `versions.embedding` in the release manifest (PRD §18.4). Mirrors the repo-wide
#: `BUILDER_VERSION` convention in `contracts.version`.
EMBEDDING_BUILD_VERSION: str = "0.0.0"

#: The fingerprint's domain-separation prefix. Bumping it invalidates every stored fingerprint on
#: purpose — do that only when the MEANING of a member changes, never when one is merely renamed.
_FINGERPRINT_DOMAIN = "taxrag/embedding-profile/v1"

Truncation = Literal["head", "tail", "error"]
Quantisation = Literal["none", "int8", "binary"]
Normalisation = Literal["none", "l2"]
DistanceMetric = Literal["cosine", "ip", "l2"]


@dataclass(frozen=True)
class EmbeddingProfile:
    """The embedding representation contract. Members and order verbatim from deliverable 1."""

    profile_id: str
    model_id: str
    model_revision: str
    tokenizer_id: str
    max_tokens: int
    truncation: Truncation
    dimensions: int
    quantisation: Quantisation
    normalisation: Normalisation
    distance_metric: DistanceMetric
    batch_size: int
    seed: int

    def __post_init__(self) -> None:
        if self.dimensions < 1:
            # `embedding-manifest.schema.json` sets `dimensions: minimum 1`, and a zero-width
            # vector cannot be searched. Fail at construction rather than at schema validation.
            raise ValueError(f"dimensions must be >= 1, got {self.dimensions}")
        if self.batch_size < 1:
            raise ValueError(f"batch_size must be >= 1, got {self.batch_size}")
        if self.max_tokens < 1:
            raise ValueError(f"max_tokens must be >= 1, got {self.max_tokens}")

    def to_json(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "model_id": self.model_id,
            "model_revision": self.model_revision,
            "tokenizer_id": self.tokenizer_id,
            "max_tokens": self.max_tokens,
            "truncation": self.truncation,
            "dimensions": self.dimensions,
            "quantisation": self.quantisation,
            "normalisation": self.normalisation,
            "distance_metric": self.distance_metric,
            "batch_size": self.batch_size,
            "seed": self.seed,
        }

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "EmbeddingProfile":
        missing = [name for name in cls.__dataclass_fields__ if name not in data]
        if missing:
            raise ValueError(f"embedding profile is missing: {', '.join(missing)}")
        return cls(**{name: data[name] for name in cls.__dataclass_fields__})


@dataclass(frozen=True)
class ModelArtefactPin:
    """Breakdown plan §8 Q11's artefact identity. Deliberately NOT part of the fingerprint."""

    sha256: str
    byte_size: int
    format: str

    def to_json(self) -> dict[str, Any]:
        return {"sha256": self.sha256, "byte_size": self.byte_size, "format": self.format}

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "ModelArtefactPin":
        missing = [name for name in ("sha256", "byte_size", "format") if name not in data]
        if missing:
            raise ValueError(f"model_artifact pin is missing: {', '.join(missing)}")
        return cls(sha256=data["sha256"], byte_size=data["byte_size"], format=data["format"])


@dataclass(frozen=True)
class LicencePin:
    """Q11's "licence information". PRD §11.1's conservative default applies to weights."""

    identifier: str
    url: str | None
    attribution_required: bool
    redistribution_permitted: bool
    notes: str | None

    def to_json(self) -> dict[str, Any]:
        return {
            "identifier": self.identifier,
            "url": self.url,
            "attribution_required": self.attribution_required,
            "redistribution_permitted": self.redistribution_permitted,
            "notes": self.notes,
        }

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "LicencePin":
        fields = ("identifier", "url", "attribution_required", "redistribution_permitted", "notes")
        missing = [name for name in fields if name not in data]
        if missing:
            raise ValueError(f"licence pin is missing: {', '.join(missing)}")
        return cls(**{name: data[name] for name in fields})


@dataclass(frozen=True)
class PinnedProfile:
    """Everything `--profile <path>` carries: the profile plus the pins declared for it.

    This is OUR file format, not a PRD-§44.3 contract — its JSON shape is documented in the
    module README and may change with this ticket. The manifest is the contract.
    """

    profile: EmbeddingProfile
    model_artifact: ModelArtefactPin
    licence: LicencePin
    tokenizer_artifact_sha256: str

    def to_json(self) -> dict[str, Any]:
        return {
            "profile": self.profile.to_json(),
            "model_artifact": self.model_artifact.to_json(),
            "licence": self.licence.to_json(),
            "tokenizer_artifact_sha256": self.tokenizer_artifact_sha256,
        }

    @classmethod
    def from_json(cls, data: Mapping[str, Any]) -> "PinnedProfile":
        for name in ("profile", "model_artifact", "licence", "tokenizer_artifact_sha256"):
            if name not in data:
                raise ValueError(f"pinned profile is missing: {name}")
        return cls(
            profile=EmbeddingProfile.from_json(data["profile"]),
            model_artifact=ModelArtefactPin.from_json(data["model_artifact"]),
            licence=LicencePin.from_json(data["licence"]),
            tokenizer_artifact_sha256=data["tokenizer_artifact_sha256"],
        )

    @classmethod
    def load(cls, path: str | Path) -> "PinnedProfile":
        return cls.from_json(json.loads(Path(path).read_text(encoding="utf-8")))


# ==================================================================================================
# Fingerprinting
# ==================================================================================================

#: The representation members, in the order the canonical form sorts them. Written out rather than
#: derived from the dataclass so that ADDING a member to `EmbeddingProfile` cannot silently change
#: every previously computed fingerprint — a change here is a deliberate, reviewable edit.
FINGERPRINT_MEMBERS: tuple[str, ...] = (
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


def _digest(values: Mapping[str, Any]) -> str:
    missing = [name for name in FINGERPRINT_MEMBERS if name not in values]
    if missing:
        raise ValueError(f"cannot fingerprint: missing {', '.join(missing)}")
    canonical = "".join(f"{name}={values[name]}\n" for name in FINGERPRINT_MEMBERS)
    payload = f"{_FINGERPRINT_DOMAIN}\n{canonical}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def profile_fingerprint(profile: EmbeddingProfile) -> str:
    """Stable lowercase-hex SHA-256 over the representation members of *profile*."""
    return _digest({name: getattr(profile, name) for name in FINGERPRINT_MEMBERS})


def fingerprint_of_manifest(document: Mapping[str, Any]) -> str:
    """Recompute `profile_fingerprint` from an emitted `embedding-manifest.json` document.

    Every fingerprinted member is a manifest member; three of them live under `tokenizer`
    (`id`, `max_tokens`, `truncation`). This is the whole reason the fingerprint need not — and
    per the schema, may not — be stored in the manifest.
    """
    tokenizer = document.get("tokenizer")
    if not isinstance(tokenizer, Mapping):
        raise ValueError("embedding manifest has no `tokenizer` object")
    values = {
        "dimensions": document.get("dimensions"),
        "distance_metric": document.get("distance_metric"),
        "max_tokens": tokenizer.get("max_tokens"),
        "model_id": document.get("model_id"),
        "model_revision": document.get("model_revision"),
        "normalisation": document.get("normalisation"),
        "profile_id": document.get("profile_id"),
        "quantisation": document.get("quantisation"),
        "tokenizer_id": tokenizer.get("id"),
        "truncation": tokenizer.get("truncation"),
    }
    absent = [name for name, value in values.items() if value is None]
    if absent:
        raise ValueError(f"embedding manifest cannot be fingerprinted: missing {', '.join(sorted(absent))}")
    return _digest(values)


def resolve_effective_profile(profile: EmbeddingProfile, provider_info: Any) -> EmbeddingProfile:
    """Return the profile describing WHAT ACTUALLY RAN.

    The provider reports the `model_id`/`model_revision` of the artefact it really loaded, and the
    manifest must record that rather than what was requested. For `DeterministicStubProvider` this
    rewrites `model_id` to `stub:<seed>`; for `LocalModelProvider` the values already agree (its
    artefact check has run first) and this is a no-op.

    Everything downstream — the fingerprint, the manifest, the guard — uses the RESULT of this
    call. Skipping it would let a stub run emit a manifest whose fingerprint disagreed with its own
    `model_id`, and the compatibility guard would then misfire on a correct rebuild.
    """
    return replace(
        profile,
        model_id=provider_info.model_id,
        model_revision=provider_info.model_revision,
    )


# ==================================================================================================
# The runtime pin (deliverable 1; breakdown plan §8 Q11)
# ==================================================================================================

#: The six `RuntimePin` members, and the two members of each nested crate pin. Written out because
#: acceptance item 5 requires the error to NAME the missing field, individually.
_RUNTIME_SCALARS = ("family", "version", "pinned_by")
_CRATE_PINS = ("integration", "tokenizer_library")
_CRATE_MEMBERS = ("crate", "version")


def runtime_pin_from_dict(data: Any, *, source: str = "runtime pin") -> Any:
    """Build a `manifest.RuntimePin` from *data*, or raise `MissingRuntimePin` naming the field.

    THIS IS THE ONLY WAY A RUNTIME PIN ENTERS THE PIPELINE. It reads the supplied mapping and
    nothing else: no `os.environ`, no `importlib.metadata`, no `Cargo.lock`, no installed package
    version. Breakdown plan §8 Q11 forbids a locally invented value for anything the release is
    meant to pin, and RETR-07's whole contribution is that the recorded value is verifiable.
    """
    if data is None:
        raise MissingRuntimePin(
            f"{source}: no runtime pin was supplied. The runtime is a build input (breakdown plan "
            "§8 Q11, owned by RETR-07 and carried by CRPS-06's BuildRequest); this pipeline never "
            "infers it from the environment, an installed package or a lockfile, and never "
            "defaults it. Missing field: runtime"
        )
    if not isinstance(data, Mapping):
        raise MissingRuntimePin(f"{source}: runtime pin must be a JSON object, got {type(data).__name__}")

    for name in _RUNTIME_SCALARS:
        value = data.get(name)
        if not isinstance(value, str) or not value.strip():
            raise MissingRuntimePin(
                f"{source}: runtime pin field `{name}` is missing or empty. Supply it from "
                "RETR-07's recorded compatibility verification; it is never defaulted."
            )

    providers = data.get("execution_providers")
    if not isinstance(providers, (list, tuple)) or not providers:
        raise MissingRuntimePin(
            f"{source}: runtime pin field `execution_providers` is missing or empty."
        )
    for entry in providers:
        if not isinstance(entry, str) or not entry.strip():
            raise MissingRuntimePin(
                f"{source}: runtime pin field `execution_providers` contains an empty entry."
            )

    crate_pins: dict[str, Any] = {}
    manifest = load_manifest()
    for pin_name in _CRATE_PINS:
        pin = data.get(pin_name)
        if not isinstance(pin, Mapping):
            raise MissingRuntimePin(f"{source}: runtime pin field `{pin_name}` is missing.")
        for member in _CRATE_MEMBERS:
            value = pin.get(member)
            if not isinstance(value, str) or not value.strip():
                raise MissingRuntimePin(
                    f"{source}: runtime pin field `{pin_name}.{member}` is missing or empty."
                )
        crate_pins[pin_name] = manifest.CratePin(crate=pin["crate"], version=pin["version"])

    # `manifest.RuntimePin` is CRPS-02's dataclass and is the single definition — this module
    # never declares a second one (ticket deliverable 1: "mirroring CRPS-02 deliverable 12
    # exactly").
    return manifest.RuntimePin(
        family=data["family"],
        version=data["version"],
        execution_providers=tuple(providers),
        integration=crate_pins["integration"],
        tokenizer_library=crate_pins["tokenizer_library"],
        pinned_by=data["pinned_by"],
    )


def load_runtime_pin(path: str | Path) -> Any:
    """Read `--runtime-pin <path>` and validate it into a `manifest.RuntimePin`."""
    target = Path(path)
    if not target.is_file():
        raise MissingRuntimePin(
            f"no runtime pin file at {target}: the runtime pin is a required build input "
            "(breakdown plan §8 Q11). Missing field: runtime"
        )
    try:
        document = json.loads(target.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise MissingRuntimePin(f"runtime pin at {target} is not valid JSON: {exc}") from exc
    return runtime_pin_from_dict(document, source=str(target))
