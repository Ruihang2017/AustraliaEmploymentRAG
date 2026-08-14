"""Assemble and write `embedding-manifest.json` (CRPS-05 deliverables 3 step 6 and 4).

NAMED `emit`, NOT `manifest`, ON PURPOSE. `pipelines/corpus-builder/src` is on `sys.path` (see
`_bootstrap`), so a module named `manifest.py` inside this package would shadow — or be shadowed by
— CRPS-02's `manifest` package depending on import order. That is a bug nobody would find quickly.

THIS MODULE DECLARES NO DATA MODEL. CRPS-02 already ships the whole thing: `EmbeddingManifest` and
its nineteen members, `ModelArtifact`, `Licence`, `Tokenizer`, `RuntimePin`, `CratePin`,
`TierSelection`, `VectorFile`, `Determinism`, `MANIFEST_VERSION`, and an ALREADY-ATOMIC
`write_manifest()` (temp file + `os.replace`) which is exactly deliverable 3's "write to a temporary
path and rename". Re-declaring any of it would create a second definition of a PRD §44.3
serial-owned contract.

VOCABULARY. The ticket fixes lowercase Literals (`"none"`, `"l2"`, `"cosine"`, `"head"`);
`embedding-manifest.schema.json` constrains these members only as non-empty strings, so both
validate. CRPS-02's own golden fixture happens to use uppercase — that is its test data, not a
contract. The ticket wins, and the divergence is reported for CRPS-06, which cross-checks the two
manifests.

WHAT IS *NOT* IN THE MANIFEST. The schema is `additionalProperties: false` at every level, so
`resumed_from`, `profile_fingerprint` and every measurement live in `EmbeddingBuildResult` /
`embedding-build-report.json` instead. Deliverable 1 calls for the fingerprint to be "recorded in
the manifest"; the schema wins (the ticket's own Feedback obligation says so), and compatibility
stays checkable because `profile.fingerprint_of_manifest()` RECOMPUTES the digest from the manifest
members themselves.
"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any, Sequence

from ._bootstrap import load_contracts_version, load_manifest
from .profile import EMBEDDING_BUILD_VERSION, EmbeddingProfile, LicencePin, ModelArtefactPin
from .provider import ProviderInfo
from .vectors import VectorFileStat

__all__ = ["MANIFEST_FILENAME", "VECTOR_FILENAME", "build_embedding_manifest", "write_embedding_manifest"]

#: PRD §18.4's fixed bundle layout.
MANIFEST_FILENAME = "embedding-manifest.json"
VECTOR_FILENAME = "vectors.usearch"


def stub_marked_runtime(runtime: Any, provider_info: ProviderInfo) -> Any:
    """Mark the runtime family as a stub when the provider is one.

    THE ONLY VALUE THIS PIPELINE EVER DERIVES INTO A PIN. The six runtime members otherwise pass
    through untouched from `--runtime-pin`, because breakdown plan §8 Q11 forbids a locally invented
    value for anything the release is meant to pin. This one derivation can only make a pin MORE
    obviously a stub, never less, and it is what lets CRPS-06's candidate gate reject a stub-built
    index from the manifest alone (acceptance item 7).
    """
    if provider_info.kind != "stub":
        return runtime
    return replace(runtime, family=f"stub:{runtime.family}")


def build_embedding_manifest(
    *,
    profile: EmbeddingProfile,
    model_artefact: ModelArtefactPin,
    licence: LicencePin,
    tokenizer_artifact_sha256: str,
    runtime: Any,
    built_at: str,
    tiers: Sequence[Any],
    chunk_count: int,
    embedded_count: int,
    skipped_count: int,
    vector_file: VectorFileStat,
    vector_path: str,
    source_release_id: str | None,
    deterministic: bool = True,
) -> Any:
    """Assemble CRPS-02's `EmbeddingManifest` from what actually ran.

    *profile* must already be the EFFECTIVE profile (`profile.resolve_effective_profile`), so
    `model_id`/`model_revision` describe the artefact that produced the vectors rather than the one
    that was requested.
    """
    manifest = load_manifest()
    contract_version = load_contracts_version().CONTRACT_VERSION

    if embedded_count != vector_file.count:
        # Asserted in code, not only in tests: acceptance item 6 ties the manifest's counts to the
        # file on disk, and a manifest that disagreed with its own artifact would be signed anyway.
        raise ValueError(
            f"embedded_count={embedded_count} disagrees with the vector file's count="
            f"{vector_file.count}; the manifest would describe an artifact that does not exist"
        )

    return manifest.EmbeddingManifest(
        manifest_version=manifest.MANIFEST_VERSION,
        profile_id=profile.profile_id,
        model_id=profile.model_id,
        model_revision=profile.model_revision,
        model_artifact=manifest.ModelArtifact(
            sha256=model_artefact.sha256,
            byte_size=model_artefact.byte_size,
            format=model_artefact.format,
        ),
        licence=manifest.Licence(
            identifier=licence.identifier,
            url=licence.url,
            attribution_required=licence.attribution_required,
            redistribution_permitted=licence.redistribution_permitted,
            notes=licence.notes,
        ),
        tokenizer=manifest.Tokenizer(
            id=profile.tokenizer_id,
            artifact_sha256=tokenizer_artifact_sha256,
            max_tokens=profile.max_tokens,
            truncation=profile.truncation,
        ),
        dimensions=profile.dimensions,
        quantisation=profile.quantisation,
        normalisation=profile.normalisation,
        distance_metric=profile.distance_metric,
        runtime=runtime,
        built_at=built_at,
        builder_version=EMBEDDING_BUILD_VERSION,
        input_contract_version=contract_version,
        tier_selection=manifest.TierSelection(
            tiers=tuple(tier.value for tier in tiers),
            chunk_count=chunk_count,
            embedded_count=embedded_count,
            skipped_count=skipped_count,
        ),
        vector_file=manifest.VectorFile(
            path=vector_path,
            sha256=vector_file.sha256,
            byte_size=vector_file.byte_size,
            count=vector_file.count,
        ),
        determinism=manifest.Determinism(seed=profile.seed, deterministic=deterministic),
        source_release_id=source_release_id,
    )


def write_embedding_manifest(document: Any, path: Path) -> None:
    """Write atomically through CRPS-02's own `write_manifest` (temp file + `os.replace`)."""
    load_manifest().write_manifest(document, path)
