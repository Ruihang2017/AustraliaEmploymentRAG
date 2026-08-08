"""Frozen dataclasses mirroring `schemas/corpus-manifest/v1/**`, plus the module's exceptions.

WHY FROZEN. CRPS-02 deliverable 6 states the ordering constraint build -> canonicalise -> hash ->
sign -> write, and that *"a manifest is never mutated after `manifest_sha256` is set"*. Frozen
dataclasses plus `dataclasses.replace` make a post-hash mutation impossible by construction rather
than by convention, which is the only version of that rule a reviewer can check.

The schema is the contract; these classes are a convenience for the Python callers (CRPS-06,
CRPS-08). Every `to_dict()` produces exactly the JSON the schema describes, and a round-trip test
asserts `from_dict(to_dict(x)) == x` for each class.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping

__all__ = [
    "Artifacts",
    "Counts",
    "CompatibilityRange",
    "CompatibilityRanges",
    "CoverageEntry",
    "CratePin",
    "Determinism",
    "EmbeddingManifest",
    "EmbeddingProfileRef",
    "EvaluationGate",
    "EvaluationSummary",
    "FileEntry",
    "Licence",
    "MANIFEST_VERSION",
    "ManifestIncomplete",
    "ModelArtifact",
    "ModelPin",
    "MODEL_ROLES",
    "RELEASE_KINDS",
    "ReleaseManifest",
    "ReleaseRowExists",
    "RuntimePin",
    "Signature",
    "SigningKeyError",
    "TierSelection",
    "Tokenizer",
    "UnsignedRelease",
    "UnsupportedKeyFormat",
    "VectorFile",
    "Versions",
    "not_run_evaluation",
    "write_manifest",
]

#: The version this build of the contract emits. Deliverable 9: the schema directory is v<major>.
MANIFEST_VERSION: str = "1.0.0"

#: Deliverable 4's manifest-only vocabulary. NOT a corpus_release.status enum — that stays FND-03's.
RELEASE_KINDS: tuple[str, ...] = ("CANDIDATE", "PUBLISHED", "SYNTHETIC_FIXTURE")

#: Breakdown plan §8 Q11 roles.
MODEL_ROLES: tuple[str, ...] = ("DOCUMENT_EMBEDDING", "QUERY_EMBEDDING", "RERANK")


# ==================================================================================================
# Exceptions
# ==================================================================================================


class ManifestIncomplete(ValueError):
    """A required PRD §18.4 or deliverable 12 input was absent. The message names the field."""


class SigningKeyError(ValueError):
    """A signing key file is unusable, or does not carry the identity the caller asked for.

    NEVER carries key material in its message — PRD §20.2.
    """


class UnsupportedKeyFormat(SigningKeyError):
    """A key file is not in the JSON form this module reads.

    Production key custody and the on-disk production format are sub-PRD open question Q-CRPS-3 and
    the Founder's decision (PRD §20.2, §39.6). Until it is taken, only the development JSON form is
    accepted, so a production format plugs in without changing `sign_manifest`'s signature.
    """


class ReleaseRowExists(RuntimeError):
    """A `corpus_release` row already exists for this release id (PRD §35.3 immutable after signing)."""


class UnsignedRelease(RuntimeError):
    """A non-CANDIDATE release was offered for persistence without a signature."""


# ==================================================================================================
# Helpers
# ==================================================================================================


def _require(mapping: Mapping[str, Any], key: str, where: str) -> Any:
    if key not in mapping:
        raise ManifestIncomplete(f"{where}.{key} is required and was absent")
    return mapping[key]


# ==================================================================================================
# Shared pin objects (deliverable 12)
# ==================================================================================================


@dataclass(frozen=True)
class ModelArtifact:
    sha256: str
    byte_size: int
    format: str

    def to_dict(self) -> dict[str, Any]:
        return {"sha256": self.sha256, "byte_size": self.byte_size, "format": self.format}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ModelArtifact":
        return cls(
            sha256=_require(data, "sha256", "model_artifact"),
            byte_size=_require(data, "byte_size", "model_artifact"),
            format=_require(data, "format", "model_artifact"),
        )


@dataclass(frozen=True)
class Licence:
    identifier: str
    url: str | None
    attribution_required: bool
    redistribution_permitted: bool
    notes: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "identifier": self.identifier,
            "url": self.url,
            "attribution_required": self.attribution_required,
            "redistribution_permitted": self.redistribution_permitted,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Licence":
        return cls(
            identifier=_require(data, "identifier", "licence"),
            url=_require(data, "url", "licence"),
            attribution_required=_require(data, "attribution_required", "licence"),
            redistribution_permitted=_require(data, "redistribution_permitted", "licence"),
            notes=_require(data, "notes", "licence"),
        )


@dataclass(frozen=True)
class Tokenizer:
    id: str
    artifact_sha256: str
    max_tokens: int
    truncation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "artifact_sha256": self.artifact_sha256,
            "max_tokens": self.max_tokens,
            "truncation": self.truncation,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Tokenizer":
        return cls(
            id=_require(data, "id", "tokenizer"),
            artifact_sha256=_require(data, "artifact_sha256", "tokenizer"),
            max_tokens=_require(data, "max_tokens", "tokenizer"),
            truncation=_require(data, "truncation", "tokenizer"),
        )


@dataclass(frozen=True)
class CratePin:
    crate: str
    version: str

    def to_dict(self) -> dict[str, Any]:
        return {"crate": self.crate, "version": self.version}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CratePin":
        return cls(crate=_require(data, "crate", "crate_pin"), version=_require(data, "version", "crate_pin"))


@dataclass(frozen=True)
class ModelPin:
    role: str
    model_id: str
    model_revision: str
    model_artifact: ModelArtifact
    dimensions: int | None
    normalisation: str
    truncation: str
    max_tokens: int
    tokenizer: Tokenizer
    licence: Licence
    bundle_path: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "role": self.role,
            "model_id": self.model_id,
            "model_revision": self.model_revision,
            "model_artifact": self.model_artifact.to_dict(),
            "dimensions": self.dimensions,
            "normalisation": self.normalisation,
            "truncation": self.truncation,
            "max_tokens": self.max_tokens,
            "tokenizer": self.tokenizer.to_dict(),
            "licence": self.licence.to_dict(),
            "bundle_path": self.bundle_path,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ModelPin":
        return cls(
            role=_require(data, "role", "model_pin"),
            model_id=_require(data, "model_id", "model_pin"),
            model_revision=_require(data, "model_revision", "model_pin"),
            model_artifact=ModelArtifact.from_dict(_require(data, "model_artifact", "model_pin")),
            dimensions=_require(data, "dimensions", "model_pin"),
            normalisation=_require(data, "normalisation", "model_pin"),
            truncation=_require(data, "truncation", "model_pin"),
            max_tokens=_require(data, "max_tokens", "model_pin"),
            tokenizer=Tokenizer.from_dict(_require(data, "tokenizer", "model_pin")),
            licence=Licence.from_dict(_require(data, "licence", "model_pin")),
            bundle_path=_require(data, "bundle_path", "model_pin"),
        )


@dataclass(frozen=True)
class RuntimePin:
    family: str
    version: str
    execution_providers: tuple[str, ...]
    integration: CratePin
    tokenizer_library: CratePin
    pinned_by: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "family": self.family,
            "version": self.version,
            "execution_providers": list(self.execution_providers),
            "integration": self.integration.to_dict(),
            "tokenizer_library": self.tokenizer_library.to_dict(),
            "pinned_by": self.pinned_by,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "RuntimePin":
        return cls(
            family=_require(data, "family", "runtime"),
            version=_require(data, "version", "runtime"),
            execution_providers=tuple(_require(data, "execution_providers", "runtime")),
            integration=CratePin.from_dict(_require(data, "integration", "runtime")),
            tokenizer_library=CratePin.from_dict(_require(data, "tokenizer_library", "runtime")),
            pinned_by=_require(data, "pinned_by", "runtime"),
        )


# ==================================================================================================
# Release-manifest members
# ==================================================================================================


@dataclass(frozen=True)
class Versions:
    schema: str
    parser: str
    chunker: str
    embedding: str
    index: str
    builder: str
    contract: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "parser": self.parser,
            "chunker": self.chunker,
            "embedding": self.embedding,
            "index": self.index,
            "builder": self.builder,
            "contract": self.contract,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Versions":
        return cls(**{name: _require(data, name, "versions") for name in
                      ("schema", "parser", "chunker", "embedding", "index", "builder", "contract")})


@dataclass(frozen=True)
class CompatibilityRange:
    min: str
    max: str | None

    def to_dict(self) -> dict[str, Any]:
        return {"min": self.min, "max": self.max}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CompatibilityRange":
        return cls(min=_require(data, "min", "compatibility"), max=_require(data, "max", "compatibility"))


@dataclass(frozen=True)
class CompatibilityRanges:
    app: CompatibilityRange
    search: CompatibilityRange
    corpus_schema: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "app": self.app.to_dict(),
            "search": self.search.to_dict(),
            "corpus_schema": self.corpus_schema,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CompatibilityRanges":
        return cls(
            app=CompatibilityRange.from_dict(_require(data, "app", "compatibility")),
            search=CompatibilityRange.from_dict(_require(data, "search", "compatibility")),
            corpus_schema=_require(data, "corpus_schema", "compatibility"),
        )


@dataclass(frozen=True)
class FileEntry:
    path: str
    sha256: str
    byte_size: int

    def to_dict(self) -> dict[str, Any]:
        return {"path": self.path, "sha256": self.sha256, "byte_size": self.byte_size}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "FileEntry":
        return cls(
            path=_require(data, "path", "files[]"),
            sha256=_require(data, "sha256", "files[]"),
            byte_size=_require(data, "byte_size", "files[]"),
        )


@dataclass(frozen=True)
class Artifacts:
    corpus_sqlite_sha256: str
    lexical_index_sha256: str
    vector_index_sha256: str
    embedding_manifest_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "corpus_sqlite_sha256": self.corpus_sqlite_sha256,
            "lexical_index_sha256": self.lexical_index_sha256,
            "vector_index_sha256": self.vector_index_sha256,
            "embedding_manifest_sha256": self.embedding_manifest_sha256,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Artifacts":
        return cls(**{name: _require(data, name, "artifacts") for name in
                      ("corpus_sqlite_sha256", "lexical_index_sha256", "vector_index_sha256",
                       "embedding_manifest_sha256")})


_COUNT_MEMBERS = (
    "sources",
    "documents",
    "document_versions",
    "nodes",
    "node_versions",
    "relations",
    "events",
    "chunks",
    "embeddings",
)


@dataclass(frozen=True)
class Counts:
    sources: int
    documents: int
    document_versions: int
    nodes: int
    node_versions: int
    relations: int
    events: int
    chunks: int
    embeddings: int

    def to_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in _COUNT_MEMBERS}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Counts":
        return cls(**{name: _require(data, name, "counts") for name in _COUNT_MEMBERS})


_COVERAGE_MEMBERS = (
    "source_group_id",
    "coverage_status",
    "freshness_status",
    "document_count",
    "earliest_effective_from",
    "latest_effective_from",
    "last_ingestion_at",
)


@dataclass(frozen=True)
class CoverageEntry:
    source_group_id: str
    coverage_status: str
    freshness_status: str
    document_count: int
    earliest_effective_from: str | None
    latest_effective_from: str | None
    last_ingestion_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return {name: getattr(self, name) for name in _COVERAGE_MEMBERS}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "CoverageEntry":
        return cls(**{name: _require(data, name, "coverage[]") for name in _COVERAGE_MEMBERS})


@dataclass(frozen=True)
class QuarantineSummary:
    open_count: int
    resolved_count: int
    by_reason_code: Mapping[str, int]

    def to_dict(self) -> dict[str, Any]:
        return {
            "open_count": self.open_count,
            "resolved_count": self.resolved_count,
            "by_reason_code": dict(self.by_reason_code),
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "QuarantineSummary":
        return cls(
            open_count=_require(data, "open_count", "quarantine"),
            resolved_count=_require(data, "resolved_count", "quarantine"),
            by_reason_code=dict(_require(data, "by_reason_code", "quarantine")),
        )


@dataclass(frozen=True)
class EvaluationGate:
    name: str
    threshold: str
    observed: str
    passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "threshold": self.threshold,
            "observed": self.observed,
            "passed": self.passed,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "EvaluationGate":
        return cls(
            name=_require(data, "name", "evaluation.gates[]"),
            threshold=_require(data, "threshold", "evaluation.gates[]"),
            observed=_require(data, "observed", "evaluation.gates[]"),
            passed=_require(data, "passed", "evaluation.gates[]"),
        )


@dataclass(frozen=True)
class EvaluationSummary:
    """PRD §18.4 'evaluation results'.

    `metrics` values and gate thresholds are DECIMAL STRINGS, never floats: the manifest is signed
    and a Rust verifier must re-derive identical bytes (see `canonical.py`).
    """

    status: str
    report_id: str | None
    ran_at: str | None
    metrics: Mapping[str, str]
    gates: tuple[EvaluationGate, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "report_id": self.report_id,
            "ran_at": self.ran_at,
            "metrics": dict(self.metrics),
            "gates": [gate.to_dict() for gate in self.gates],
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "EvaluationSummary":
        return cls(
            status=_require(data, "status", "evaluation"),
            report_id=_require(data, "report_id", "evaluation"),
            ran_at=_require(data, "ran_at", "evaluation"),
            metrics=dict(_require(data, "metrics", "evaluation")),
            gates=tuple(EvaluationGate.from_dict(gate) for gate in _require(data, "gates", "evaluation")),
        )


def not_run_evaluation() -> EvaluationSummary:
    """The explicit 'evaluation did not run' shape.

    The member stays REQUIRED (ticket Feedback obligation): an absent member and an unevaluated
    release must not look the same, and the gating rule lives in CRPS-06, not here.
    """
    return EvaluationSummary(status="NOT_RUN", report_id=None, ran_at=None, metrics={}, gates=())


@dataclass(frozen=True)
class EmbeddingProfileRef:
    profile_id: str
    model_id: str
    dimensions: int
    quantisation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "model_id": self.model_id,
            "dimensions": self.dimensions,
            "quantisation": self.quantisation,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "EmbeddingProfileRef":
        return cls(**{name: _require(data, name, "embedding_profile") for name in
                      ("profile_id", "model_id", "dimensions", "quantisation")})


@dataclass(frozen=True)
class Signature:
    """A detached signature over `canonical_bytes(manifest)`.

    `signed_at` is OUTSIDE the signed bytes by construction (the whole `signature` member is
    excluded from the canonical form, or verification would be circular), so it is unauthenticated
    metadata. No consumer may treat it as evidence.
    """

    algorithm: str
    key_id: str
    value: str
    signed_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "algorithm": self.algorithm,
            "key_id": self.key_id,
            "value": self.value,
            "signed_at": self.signed_at,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Signature":
        return cls(**{name: _require(data, name, "signature") for name in
                      ("algorithm", "key_id", "value", "signed_at")})


@dataclass(frozen=True)
class ReleaseManifest:
    manifest_version: str
    release_id: str
    release_kind: str
    parent_release_id: str | None
    created_at: str
    build_started_at: str
    build_finished_at: str
    versions: Versions
    compatibility: CompatibilityRanges
    files: tuple[FileEntry, ...]
    artifacts: Artifacts
    counts: Counts
    coverage: tuple[CoverageEntry, ...]
    quarantine: QuarantineSummary
    evaluation: EvaluationSummary
    embedding_profile: EmbeddingProfileRef
    local_models: tuple[ModelPin, ...]
    runtime: RuntimePin
    signature: Signature | None
    manifest_sha256: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "manifest_version": self.manifest_version,
            "release_id": self.release_id,
            "release_kind": self.release_kind,
            "parent_release_id": self.parent_release_id,
            "created_at": self.created_at,
            "build_started_at": self.build_started_at,
            "build_finished_at": self.build_finished_at,
            "versions": self.versions.to_dict(),
            "compatibility": self.compatibility.to_dict(),
            "files": [entry.to_dict() for entry in self.files],
            "artifacts": self.artifacts.to_dict(),
            "counts": self.counts.to_dict(),
            "coverage": [entry.to_dict() for entry in self.coverage],
            "quarantine": self.quarantine.to_dict(),
            "evaluation": self.evaluation.to_dict(),
            "embedding_profile": self.embedding_profile.to_dict(),
            "local_models": [pin.to_dict() for pin in self.local_models],
            "runtime": self.runtime.to_dict(),
            "signature": None if self.signature is None else self.signature.to_dict(),
            "manifest_sha256": self.manifest_sha256,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "ReleaseManifest":
        where = "release-manifest"
        signature = _require(data, "signature", where)
        return cls(
            manifest_version=_require(data, "manifest_version", where),
            release_id=_require(data, "release_id", where),
            release_kind=_require(data, "release_kind", where),
            parent_release_id=_require(data, "parent_release_id", where),
            created_at=_require(data, "created_at", where),
            build_started_at=_require(data, "build_started_at", where),
            build_finished_at=_require(data, "build_finished_at", where),
            versions=Versions.from_dict(_require(data, "versions", where)),
            compatibility=CompatibilityRanges.from_dict(_require(data, "compatibility", where)),
            files=tuple(FileEntry.from_dict(item) for item in _require(data, "files", where)),
            artifacts=Artifacts.from_dict(_require(data, "artifacts", where)),
            counts=Counts.from_dict(_require(data, "counts", where)),
            coverage=tuple(CoverageEntry.from_dict(item) for item in _require(data, "coverage", where)),
            quarantine=QuarantineSummary.from_dict(_require(data, "quarantine", where)),
            evaluation=EvaluationSummary.from_dict(_require(data, "evaluation", where)),
            embedding_profile=EmbeddingProfileRef.from_dict(_require(data, "embedding_profile", where)),
            local_models=tuple(ModelPin.from_dict(item) for item in _require(data, "local_models", where)),
            runtime=RuntimePin.from_dict(_require(data, "runtime", where)),
            signature=None if signature is None else Signature.from_dict(signature),
            manifest_sha256=_require(data, "manifest_sha256", where),
        )

    def to_json_bytes(self) -> bytes:
        """The on-disk pretty form: deterministic, UTF-8, LF, one trailing newline.

        This is NOT the signed form — `canonical.canonical_bytes()` is. A reader that re-hashes the
        file bytes and expects `manifest_sha256` will be disappointed on purpose: the digest is over
        the canonical form, which excludes `signature` and `manifest_sha256` themselves.
        """
        text = json.dumps(self.to_dict(), sort_keys=True, indent=2, ensure_ascii=False)
        return (text + "\n").encode("utf-8")

    def replace_signature(self, signature: Signature | None) -> "ReleaseManifest":
        return replace(self, signature=signature)


# ==================================================================================================
# Embedding manifest
# ==================================================================================================


@dataclass(frozen=True)
class TierSelection:
    tiers: tuple[str, ...]
    chunk_count: int
    embedded_count: int
    skipped_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "tiers": list(self.tiers),
            "chunk_count": self.chunk_count,
            "embedded_count": self.embedded_count,
            "skipped_count": self.skipped_count,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "TierSelection":
        return cls(
            tiers=tuple(_require(data, "tiers", "tier_selection")),
            chunk_count=_require(data, "chunk_count", "tier_selection"),
            embedded_count=_require(data, "embedded_count", "tier_selection"),
            skipped_count=_require(data, "skipped_count", "tier_selection"),
        )


@dataclass(frozen=True)
class VectorFile:
    path: str
    sha256: str
    byte_size: int
    count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "sha256": self.sha256,
            "byte_size": self.byte_size,
            "count": self.count,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "VectorFile":
        return cls(**{name: _require(data, name, "vector_file") for name in
                      ("path", "sha256", "byte_size", "count")})


@dataclass(frozen=True)
class Determinism:
    seed: int | None
    deterministic: bool

    def to_dict(self) -> dict[str, Any]:
        return {"seed": self.seed, "deterministic": self.deterministic}

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "Determinism":
        return cls(
            seed=_require(data, "seed", "determinism"),
            deterministic=_require(data, "deterministic", "determinism"),
        )


_EMBEDDING_SCALARS = (
    "manifest_version",
    "profile_id",
    "model_id",
    "model_revision",
    "dimensions",
    "quantisation",
    "normalisation",
    "distance_metric",
    "built_at",
    "builder_version",
    "input_contract_version",
    "source_release_id",
)


@dataclass(frozen=True)
class EmbeddingManifest:
    manifest_version: str
    profile_id: str
    model_id: str
    model_revision: str
    model_artifact: ModelArtifact
    licence: Licence
    tokenizer: Tokenizer
    dimensions: int
    quantisation: str
    normalisation: str
    distance_metric: str
    runtime: RuntimePin
    built_at: str
    builder_version: str
    input_contract_version: str
    tier_selection: TierSelection
    vector_file: VectorFile
    determinism: Determinism
    source_release_id: str | None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {name: getattr(self, name) for name in _EMBEDDING_SCALARS}
        data["model_artifact"] = self.model_artifact.to_dict()
        data["licence"] = self.licence.to_dict()
        data["tokenizer"] = self.tokenizer.to_dict()
        data["runtime"] = self.runtime.to_dict()
        data["tier_selection"] = self.tier_selection.to_dict()
        data["vector_file"] = self.vector_file.to_dict()
        data["determinism"] = self.determinism.to_dict()
        return data

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "EmbeddingManifest":
        where = "embedding-manifest"
        kwargs: dict[str, Any] = {name: _require(data, name, where) for name in _EMBEDDING_SCALARS}
        kwargs["model_artifact"] = ModelArtifact.from_dict(_require(data, "model_artifact", where))
        kwargs["licence"] = Licence.from_dict(_require(data, "licence", where))
        kwargs["tokenizer"] = Tokenizer.from_dict(_require(data, "tokenizer", where))
        kwargs["runtime"] = RuntimePin.from_dict(_require(data, "runtime", where))
        kwargs["tier_selection"] = TierSelection.from_dict(_require(data, "tier_selection", where))
        kwargs["vector_file"] = VectorFile.from_dict(_require(data, "vector_file", where))
        kwargs["determinism"] = Determinism.from_dict(_require(data, "determinism", where))
        return cls(**kwargs)

    def to_json_bytes(self) -> bytes:
        text = json.dumps(self.to_dict(), sort_keys=True, indent=2, ensure_ascii=False)
        return (text + "\n").encode("utf-8")


# ==================================================================================================
# Writing
# ==================================================================================================


def write_manifest(payload: ReleaseManifest | EmbeddingManifest | bytes, path: Path) -> None:
    """Write *payload* to *path* atomically.

    Temp file plus `os.replace`, so a crash mid-write cannot leave a half-written manifest that a
    verifier would report as corruption rather than as an aborted build.
    """
    data = payload if isinstance(payload, bytes) else payload.to_json_bytes()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".partial")
    temporary.write_bytes(data)
    os.replace(temporary, path)
