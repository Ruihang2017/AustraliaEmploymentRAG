"""The CorpusRelease manifest: build, canonicalise, hash, sign, verify, persist.

CRPS-02. The JSON contract itself lives at `schemas/corpus-manifest/v1/**` and is PRD §44.3
serial-owned by module 04-corpus-contract; this package is the Python side of it. A consumer that
cannot run Python (RETR-01 in Rust, RLSE-07 on the production host) re-implements the verifier
against the schemas plus `schemas/corpus-manifest/README.md`, never against this code.

THE ORDERING CONSTRAINT, which is the whole safety argument (deliverable 6):

    build_release_manifest()  ->  canonical_bytes()  ->  manifest_sha256  ->  sign_manifest()
                                                                                    -> write_manifest()

A manifest is never mutated after `manifest_sha256` is set. Every dataclass here is frozen, so a
"change" is a new object via `dataclasses.replace`, and `sign_manifest()` re-asserts the recorded
digest before it signs. The signed bytes EXCLUDE `signature` and `manifest_sha256` — otherwise
verification would be circular — with the documented consequence that `signature.signed_at` is
unauthenticated metadata.

IMPORT CONVENTION (fixed by CRPS-01, `src/contracts/__init__.py`): modules under
`pipelines/corpus-builder/src/` are TOP-LEVEL modules rooted at that directory — `contracts`, and
now `manifest`. `manifest` may read `contracts`; the reverse never happens.
"""

from __future__ import annotations

from .builder import BUNDLE_LAYOUT, build_release_manifest, directory_digest, file_sha256
from .canonical import (
    CANONICAL_EXCLUDED,
    NonCanonicalValue,
    canonical_bytes,
    canonical_json,
    canonical_value,
    manifest_sha256,
)
from .findings import FINDING_CODES, Finding, Severity, VerificationReport
from .model import (
    MANIFEST_VERSION,
    MODEL_ROLES,
    RELEASE_KINDS,
    Artifacts,
    CompatibilityRange,
    CompatibilityRanges,
    Counts,
    CoverageEntry,
    CratePin,
    Determinism,
    EmbeddingManifest,
    EmbeddingProfileRef,
    EvaluationGate,
    EvaluationSummary,
    FileEntry,
    Licence,
    ManifestIncomplete,
    ModelArtifact,
    ModelPin,
    QuarantineSummary,
    ReleaseManifest,
    ReleaseRowExists,
    RuntimePin,
    Signature,
    SigningKeyError,
    TierSelection,
    Tokenizer,
    UnsignedRelease,
    UnsupportedKeyFormat,
    VectorFile,
    Versions,
    not_run_evaluation,
    write_manifest,
)
from .persist import insert_release_row
from .signing import (
    ALGORITHM,
    DEVELOPMENT_SIGNER_PREFIX,
    SIGNING_KEYFILE_ENV,
    load_private_key,
    load_public_key,
    public_keys_from,
    sign_manifest,
    verify_signature,
)
from .verify import PRD_BUNDLE_PATHS, Compatibility, is_stub, verify_bundle

__all__ = [
    "ALGORITHM",
    "Artifacts",
    "BUNDLE_LAYOUT",
    "CANONICAL_EXCLUDED",
    "Compatibility",
    "CompatibilityRange",
    "CompatibilityRanges",
    "Counts",
    "CoverageEntry",
    "CratePin",
    "DEVELOPMENT_SIGNER_PREFIX",
    "Determinism",
    "EmbeddingManifest",
    "EmbeddingProfileRef",
    "EvaluationGate",
    "EvaluationSummary",
    "FINDING_CODES",
    "FileEntry",
    "Finding",
    "Licence",
    "MANIFEST_VERSION",
    "MODEL_ROLES",
    "ManifestIncomplete",
    "ModelArtifact",
    "ModelPin",
    "NonCanonicalValue",
    "PRD_BUNDLE_PATHS",
    "QuarantineSummary",
    "RELEASE_KINDS",
    "ReleaseManifest",
    "ReleaseRowExists",
    "RuntimePin",
    "SIGNING_KEYFILE_ENV",
    "Severity",
    "Signature",
    "SigningKeyError",
    "TierSelection",
    "Tokenizer",
    "UnsignedRelease",
    "UnsupportedKeyFormat",
    "VectorFile",
    "VerificationReport",
    "Versions",
    "build_release_manifest",
    "canonical_bytes",
    "canonical_json",
    "canonical_value",
    "directory_digest",
    "file_sha256",
    "insert_release_row",
    "is_stub",
    "load_private_key",
    "load_public_key",
    "manifest_sha256",
    "not_run_evaluation",
    "public_keys_from",
    "sign_manifest",
    "verify_bundle",
    "verify_signature",
    "write_manifest",
]
