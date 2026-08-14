"""Assemble the signed PRD §18.4 bundle (CRPS-08 deliverables 2, 3 and 5).

ORDER OF OPERATIONS — do not reorder. Hashing must see the FINAL bytes of every member, so the
manifest is built last, and it is signed before it is written:

    corpus.sqlite -> tantivy/INDEX_STATE.json -> vectors.usearch -> embedding-manifest.json
        -> build_release_manifest() -> sign_manifest() -> write_manifest() -> verify_bundle()

The last step is not decoration: a generator that emits a bundle its own verifier rejects must fail
loudly (deliverable 2), and the check uses the same `verify_bundle()` RETR-01 will re-implement in
Rust. Nothing here stubs, monkeypatches or short-circuits verification.

NO `corpus_release` ROW IS WRITTEN, deliberately. `insert_release_row()` would either change
`corpus.sqlite`'s bytes after the manifest hashed them (invalidating every recorded digest) or have
to run before signing, which is impossible because the row carries the signature. The release
identity travels in `corpus_meta.release_id` and in the manifest instead.

TIMESTAMPS. The signed manifest covers `build_started_at`, `build_finished_at` and `created_at`, so
a fresh clock changes `manifest_sha256` and the signature as well as the visible timestamps. The
caller therefore supplies `built_at`, and `signature.signed_at` is pinned to it too — that member is
outside the signed bytes by construction (`canonical.py`), so pinning it is not a claim about
anything a verifier checks, and it is what makes "regeneration leaves `git status` clean" literally
true. `cli.py --now` opts into a fresh stamp.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path

from ._paths import (
    DEV_PUBLIC_KEYFILE,
    DEV_SIGNER_ID,
    DEV_SIGNING_KEYFILE,
    INDEX_VERSION_PLACEHOLDER,
    RELEASE_ID,
    SEED_DEFAULT,
    ensure_src_on_path,
)
from .synthetic_corpus import CorpusStats, generate_corpus

ensure_src_on_path()

from contracts.schema import utc_now  # noqa: E402
from contracts.version import BUILDER_VERSION, CONTRACT_VERSION, SCHEMA_VERSION  # noqa: E402
from manifest import (  # noqa: E402
    CompatibilityRange,
    CompatibilityRanges,
    Counts,
    CoverageEntry,
    CratePin,
    Determinism,
    EmbeddingManifest,
    EmbeddingProfileRef,
    Licence,
    ModelArtifact,
    ModelPin,
    QuarantineSummary,
    RuntimePin,
    TierSelection,
    Tokenizer,
    VectorFile,
    Versions,
    build_release_manifest,
    not_run_evaluation,
    public_keys_from,
    sign_manifest,
    verify_bundle,
    write_manifest,
)

__all__ = [
    "BUNDLE_MEMBERS",
    "EMBEDDING_PROFILE_ID",
    "INDEX_STATE_FILENAME",
    "STUB_MODEL_ID",
    "FixtureBuildFailed",
    "build_fixture_release",
    "index_state_document",
    "vector_placeholder_document",
]

#: SHA-256 of empty input. Recorded where the fixture pins an artefact that does not exist: the
#: contract demands 64 hex characters and admits no null, and the `stub:` markers beside it carry
#: the real signal. Explained in `fixtures/README.md` so nobody reads it as a real artefact hash.
EMPTY_DIGEST = hashlib.sha256(b"").hexdigest()

INDEX_STATE_FILENAME = "INDEX_STATE.json"
STUB_MODEL_ID = "stub:synthetic-fixture"
EMBEDDING_PROFILE_ID = "fixture-stub-profile"

BUNDLE_MEMBERS: tuple[str, ...] = (
    "corpus.sqlite",
    f"tantivy/{INDEX_STATE_FILENAME}",
    "vectors.usearch",
    "embedding-manifest.json",
    "release-manifest.json",
)

_FIXTURE_COMPONENT_VERSION = "0.0.0-synthetic-fixture"


class FixtureBuildFailed(RuntimeError):
    """The generator produced a bundle that does not verify. The message names every finding."""


# ==================================================================================================
# Placeholder members (deliverable 3) — declared, never disguised
# ==================================================================================================


def index_state_document() -> dict[str, object]:
    """Exactly the object deliverable 3 specifies, and nothing else goes in `tantivy/`."""
    return {
        "state": "PLACEHOLDER",
        "reason": "synthetic fixture; see CRPS-06/Q-CRPS-2",
        "index_version": None,
    }


def vector_placeholder_document() -> dict[str, object]:
    """`vectors.usearch` while no embedding pass exists.

    Deliberately NOT a parseable usearch index. A consumer that tries to open it fails loudly, which
    is strictly better than a valid empty index that would silently return no neighbours and look
    like a retrieval quality problem.
    """
    return {
        "state": "PLACEHOLDER",
        "reason": "synthetic fixture; no embedding pass has run (CRPS-05 has not landed)",
        "vector_count": 0,
    }


def _write_json(path: Path, document: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    )


# ==================================================================================================
# Pins
# ==================================================================================================


def _licence() -> Licence:
    return Licence(
        identifier="NOT-APPLICABLE-SYNTHETIC-FIXTURE",
        url=None,
        attribution_required=False,
        redistribution_permitted=False,
        notes="No model artefact exists; this fixture embeds nothing.",
    )


def _tokenizer() -> Tokenizer:
    return Tokenizer(
        id="stub:no-tokenizer",
        artifact_sha256=EMPTY_DIGEST,
        max_tokens=512,
        truncation="RIGHT",
    )


def _runtime() -> RuntimePin:
    return RuntimePin(
        family="stub:runtime",
        version=_FIXTURE_COMPONENT_VERSION,
        execution_providers=("CPU",),
        integration=CratePin(crate="ort", version=_FIXTURE_COMPONENT_VERSION),
        tokenizer_library=CratePin(crate="tokenizers", version=_FIXTURE_COMPONENT_VERSION),
        pinned_by="SYNTHETIC-FIXTURE-NO-VERIFICATION-RECORD",
    )


def _document_pin() -> ModelPin:
    tokenizer = _tokenizer()
    return ModelPin(
        role="DOCUMENT_EMBEDDING",
        model_id=STUB_MODEL_ID,
        model_revision="stub:no-revision",
        model_artifact=ModelArtifact(sha256=EMPTY_DIGEST, byte_size=0, format="none"),
        dimensions=8,
        normalisation="NONE",
        truncation=tokenizer.truncation,
        max_tokens=tokenizer.max_tokens,
        tokenizer=tokenizer,
        licence=_licence(),
        bundle_path=None,
    )


def _embedding_manifest(
    *, seed: int, built_at: str, stats: CorpusStats, vector_path: Path
) -> EmbeddingManifest:
    pin = _document_pin()
    return EmbeddingManifest(
        manifest_version="1.0.0",
        profile_id=EMBEDDING_PROFILE_ID,
        model_id=pin.model_id,
        model_revision=pin.model_revision,
        model_artifact=pin.model_artifact,
        licence=pin.licence,
        tokenizer=pin.tokenizer,
        dimensions=8,
        quantisation="NONE",
        normalisation=pin.normalisation,
        distance_metric="COSINE",
        runtime=_runtime(),
        built_at=built_at,
        builder_version=BUILDER_VERSION,
        input_contract_version=CONTRACT_VERSION,
        tier_selection=TierSelection(
            tiers=(),
            chunk_count=stats.chunks,
            embedded_count=0,
            skipped_count=stats.chunks,
        ),
        vector_file=VectorFile(
            path="vectors.usearch",
            sha256=hashlib.sha256(vector_path.read_bytes()).hexdigest(),
            byte_size=vector_path.stat().st_size,
            count=0,
        ),
        determinism=Determinism(seed=seed, deterministic=True),
        source_release_id=RELEASE_ID,
    )


# ==================================================================================================
# The build
# ==================================================================================================


def build_fixture_release(
    out_dir: str | Path,
    *,
    seed: int = SEED_DEFAULT,
    key_path: Path = DEV_SIGNING_KEYFILE,
    key_id: str = DEV_SIGNER_ID,
    built_at: str | None = None,
) -> Path:
    """Build the signed `SYNTHETIC_FIXTURE` bundle in *out_dir* and return it, verified."""
    bundle = Path(out_dir)
    if bundle.exists() and any(bundle.iterdir()):
        raise FixtureBuildFailed(
            f"refusing to build into a non-empty directory: {bundle}. Any leftover file would be "
            "reported as BUNDLE_FILE_UNLISTED by verify_bundle(); build into a clean directory."
        )
    bundle.mkdir(parents=True, exist_ok=True)
    stamp = built_at if built_at is not None else utc_now()

    stats = generate_corpus(bundle / "corpus.sqlite", seed=seed)
    _write_json(bundle / "tantivy" / INDEX_STATE_FILENAME, index_state_document())
    _write_json(bundle / "vectors.usearch", vector_placeholder_document())

    embedding = _embedding_manifest(
        seed=seed, built_at=stamp, stats=stats, vector_path=bundle / "vectors.usearch"
    )
    write_manifest(embedding, bundle / "embedding-manifest.json")

    document_pin = _document_pin()
    manifest = build_release_manifest(
        bundle,
        release_id=RELEASE_ID,
        release_kind="SYNTHETIC_FIXTURE",
        parent_release_id=None,
        versions=Versions(
            schema=SCHEMA_VERSION,
            parser=_FIXTURE_COMPONENT_VERSION,
            chunker=_FIXTURE_COMPONENT_VERSION,
            embedding=_FIXTURE_COMPONENT_VERSION,
            index=INDEX_VERSION_PLACEHOLDER,
            builder=BUILDER_VERSION,
            contract=CONTRACT_VERSION,
        ),
        compatibility=CompatibilityRanges(
            app=CompatibilityRange(min="0.1.0", max=None),
            search=CompatibilityRange(min="0.1.0", max=None),
            corpus_schema=SCHEMA_VERSION,
        ),
        counts=Counts(
            sources=stats.sources,
            documents=stats.documents,
            document_versions=stats.document_versions,
            nodes=stats.nodes,
            node_versions=stats.node_versions,
            relations=stats.relations,
            events=stats.events,
            chunks=stats.chunks,
            embeddings=stats.embeddings,
        ),
        coverage=tuple(
            CoverageEntry(
                source_group_id=entry.source_group_id,
                coverage_status=entry.coverage_status,
                freshness_status=entry.freshness_status,
                document_count=entry.document_count,
                earliest_effective_from=entry.earliest_effective_from,
                latest_effective_from=entry.latest_effective_from,
                last_ingestion_at=entry.last_ingestion_at,
            )
            for entry in stats.coverage
        ),
        quarantine=QuarantineSummary(
            open_count=stats.quarantine_open,
            resolved_count=stats.quarantine_resolved,
            by_reason_code=dict(stats.quarantine_by_reason_code),
        ),
        evaluation=not_run_evaluation(),
        embedding_profile=EmbeddingProfileRef(
            profile_id=EMBEDDING_PROFILE_ID,
            model_id=embedding.model_id,
            dimensions=embedding.dimensions,
            quantisation=embedding.quantisation,
        ),
        local_models=(document_pin, replace(document_pin, role="QUERY_EMBEDDING")),
        runtime=_runtime(),
        build_started_at=stamp,
        build_finished_at=stamp,
        created_at=stamp,
    )
    manifest = sign_manifest(manifest, private_key_path=Path(key_path), key_id=key_id)
    assert manifest.signature is not None
    # `signature.signed_at` is EXCLUDED from the signed canonical bytes (`canonical.py`), so pinning
    # it neither weakens nor forges anything a verifier checks — it only removes the one clock read
    # that would otherwise make an in-place regeneration dirty the tree.
    manifest = manifest.replace_signature(replace(manifest.signature, signed_at=stamp))
    write_manifest(manifest, bundle / "release-manifest.json")

    report = verify_bundle(bundle, public_keys=public_keys_from(DEV_PUBLIC_KEYFILE))
    if not report.ok:
        raise FixtureBuildFailed(
            f"the generated bundle at {bundle} does not verify; it was left in place for "
            "inspection. BLOCKING findings: "
            + "; ".join(
                f"{finding.code} [{finding.subject}] {finding.message}"
                for finding in report.blocking()
            )
        )
    return bundle
