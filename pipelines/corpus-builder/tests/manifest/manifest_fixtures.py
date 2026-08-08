"""Import path and bundle fixtures for the CRPS-02 manifest suite.

NOT named `conftest.py` ON PURPOSE — see `conftest.py`, which imports the two fixtures from here.
Three directories in this repository hold a `conftest.py`, none of them is a package, and under a
whole-suite run only one module named `conftest` survives in `sys.modules`; a test module importing
helpers by that name gets whichever was imported last.

`pipelines/corpus-builder/src` is not importable by package path (the directory name contains a
hyphen) and the root pytest config puts only the repository root on `sys.path`, so each test
directory in this ticket's file-scope prepends it here. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.

`bundle_factory` builds a complete, signed PRD §18.4 bundle in `tmp_path`. Every deliverable 12 pin
is a parameter so a pinning test can vary exactly one member — that is the whole point of the
factory, and it is the construction pattern RETR-01 and RLSE-07 copy.
"""

from __future__ import annotations

import copy
import json
import sys
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable

import pytest


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
_SRC = str(REPO_ROOT / "pipelines" / "corpus-builder" / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from contracts.schema import create_corpus_database  # noqa: E402
from contracts.version import SCHEMA_VERSION  # noqa: E402
from manifest import (  # noqa: E402
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
    public_keys_from,
    sign_manifest,
    write_manifest,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
PRIVATE_KEYFILE = FIXTURES / "keys" / "dev-corpus-signing-001.private.json"
PUBLIC_KEYFILE = FIXTURES / "keys" / "dev-corpus-signing-001.public.json"
DEV_SIGNER_ID = "dev-corpus-signing-001"

#: Hashes and versions below are FIXTURE VALUES, not choices: CRPS-02 writes no model, dimension,
#: tokenizer setting or version number of its own (ticket Non-goals). They exist only so the tests
#: have something concrete to vary.
_ARTIFACT_HASH = "1" * 64
_TOKENIZER_HASH = "2" * 64


def _licence() -> Licence:
    return Licence(
        identifier="FIXTURE-LICENCE",
        url=None,
        attribution_required=True,
        redistribution_permitted=False,
        notes=None,
    )


def _tokenizer() -> Tokenizer:
    return Tokenizer(
        id="fixture-tokenizer",
        artifact_sha256=_TOKENIZER_HASH,
        max_tokens=512,
        truncation="RIGHT",
    )


def _runtime() -> RuntimePin:
    return RuntimePin(
        family="fixture-runtime",
        version="1.2.3",
        execution_providers=("CPU",),
        integration=CratePin(crate="ort", version="0.0.0-fixture"),
        tokenizer_library=CratePin(crate="tokenizers", version="0.0.0-fixture"),
        pinned_by="FIXTURE-VERIFICATION-RECORD",
    )


def _document_pin() -> ModelPin:
    return ModelPin(
        role="DOCUMENT_EMBEDDING",
        model_id="fixture/document-embedding",
        model_revision="rev-0000000000000000",
        model_artifact=ModelArtifact(sha256=_ARTIFACT_HASH, byte_size=1024, format="onnx"),
        dimensions=8,
        normalisation="L2",
        truncation="RIGHT",
        max_tokens=512,
        tokenizer=_tokenizer(),
        licence=_licence(),
        bundle_path=None,
    )


def _query_pin() -> ModelPin:
    return replace(_document_pin(), role="QUERY_EMBEDDING")


def _embedding_manifest() -> EmbeddingManifest:
    return EmbeddingManifest(
        manifest_version="1.0.0",
        profile_id="fixture-profile",
        model_id="fixture/document-embedding",
        model_revision="rev-0000000000000000",
        model_artifact=ModelArtifact(sha256=_ARTIFACT_HASH, byte_size=1024, format="onnx"),
        licence=_licence(),
        tokenizer=_tokenizer(),
        dimensions=8,
        quantisation="FLOAT32",
        normalisation="L2",
        distance_metric="COSINE",
        runtime=_runtime(),
        built_at="2026-01-01T00:00:00Z",
        builder_version="0.0.0",
        input_contract_version="1.0.0",
        tier_selection=TierSelection(tiers=("TIER_A",), chunk_count=3, embedded_count=3, skipped_count=0),
        vector_file=VectorFile(path="vectors.usearch", sha256="0" * 64, byte_size=0, count=3),
        determinism=Determinism(seed=7, deterministic=True),
        source_release_id=None,
    )


def _versions() -> Versions:
    return Versions(
        schema=SCHEMA_VERSION,
        parser="1.0.0",
        chunker="1.0.0",
        embedding="1.0.0",
        index="1.0.0",
        builder="0.0.0",
        contract="1.0.0",
    )


def _compatibility() -> CompatibilityRanges:
    return CompatibilityRanges(
        app=CompatibilityRange(min="1.0.0", max="2.0.0"),
        search=CompatibilityRange(min="1.0.0", max=None),
        corpus_schema=SCHEMA_VERSION,
    )


def _counts() -> Counts:
    return Counts(
        sources=1,
        documents=1,
        document_versions=1,
        nodes=1,
        node_versions=1,
        relations=0,
        events=0,
        chunks=3,
        embeddings=3,
    )


def _coverage() -> tuple[CoverageEntry, ...]:
    return (
        CoverageEntry(
            source_group_id="fixture-group",
            coverage_status="COMPLETE",
            freshness_status="CURRENT",
            document_count=1,
            earliest_effective_from="2020-01-01",
            latest_effective_from="2026-01-01",
            last_ingestion_at="2026-01-01T00:00:00Z",
        ),
    )


def _evaluation() -> EvaluationSummary:
    return EvaluationSummary(
        status="PASSED",
        report_id="fixture-report",
        ran_at="2026-01-01T00:00:00Z",
        metrics={"recall_at_10": "0.87"},
        gates=(EvaluationGate(name="recall_at_10", threshold="0.80", observed="0.87", passed=True),),
    )


def _profile() -> EmbeddingProfileRef:
    return EmbeddingProfileRef(
        profile_id="fixture-profile",
        model_id="fixture/document-embedding",
        dimensions=8,
        quantisation="FLOAT32",
    )


@pytest.fixture
def trusted_keys() -> dict[str, bytes]:
    return public_keys_from(PUBLIC_KEYFILE)


@pytest.fixture
def bundle_factory(tmp_path: Path) -> Callable[..., Path]:
    """Build a signed PRD §18.4 bundle and return its directory.

    Keyword arguments let one test vary exactly one thing:
      `release_kind`, `local_models`, `runtime`, `embedding_profile`, `versions`, `evaluation`,
      `embedding_overrides` (a dict merged into embedding-manifest.json AFTER the release manifest
      is built, so the two can be made to disagree), `sign` (False leaves it unsigned), and
      `extra_files` (a `{relative path: bytes}` map written before hashing).
    """
    counter = {"n": 0}

    def factory(
        *,
        release_kind: str = "CANDIDATE",
        release_id: str | None = None,
        local_models: tuple[ModelPin, ...] | None = None,
        runtime: RuntimePin | None = None,
        embedding_profile: EmbeddingProfileRef | None = None,
        versions: Versions | None = None,
        evaluation: EvaluationSummary | None = None,
        embedding_manifest: EmbeddingManifest | None = None,
        embedding_overrides: dict[str, Any] | None = None,
        extra_files: dict[str, bytes] | None = None,
        sign: bool = True,
        lexical_files: dict[str, bytes] | None = None,
    ) -> Path:
        counter["n"] += 1
        bundle = tmp_path / f"corpus-release-{counter['n']}"
        bundle.mkdir()

        create_corpus_database(bundle / "corpus.sqlite", release_id=release_id or "rel-0001")
        lexical = bundle / "tantivy"
        lexical.mkdir()
        for name, payload in (lexical_files or {"meta.json": b'{"fixture": true}\n'}).items():
            (lexical / name).write_bytes(payload)
        (bundle / "vectors.usearch").write_bytes(b"fixture-vector-index\n")
        for name, payload in (extra_files or {}).items():
            target = bundle / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(payload)

        embedding = embedding_manifest if embedding_manifest is not None else _embedding_manifest()
        embedding_document = embedding.to_dict()
        if embedding_overrides:
            embedding_document = _deep_merge(embedding_document, embedding_overrides)
        write_manifest(
            (json.dumps(embedding_document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
            bundle / "embedding-manifest.json",
        )

        manifest = build_release_manifest(
            bundle,
            release_id=release_id or "rel-0001",
            release_kind=release_kind,
            parent_release_id=None,
            versions=versions if versions is not None else _versions(),
            compatibility=_compatibility(),
            counts=_counts(),
            coverage=_coverage(),
            quarantine=QuarantineSummary(open_count=0, resolved_count=0, by_reason_code={}),
            evaluation=evaluation if evaluation is not None else _evaluation(),
            embedding_profile=embedding_profile if embedding_profile is not None else _profile(),
            local_models=local_models if local_models is not None else (_document_pin(), _query_pin()),
            runtime=runtime if runtime is not None else _runtime(),
            build_started_at="2026-01-01T00:00:00Z",
            build_finished_at="2026-01-01T00:10:00Z",
            created_at="2026-01-01T00:10:00Z",
        )
        if sign:
            manifest = sign_manifest(manifest, private_key_path=PRIVATE_KEYFILE, key_id=DEV_SIGNER_ID)
        write_manifest(manifest, bundle / "release-manifest.json")
        return bundle

    return factory


def _deep_merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def read_manifest(bundle: Path) -> dict[str, Any]:
    return json.loads((bundle / "release-manifest.json").read_text(encoding="utf-8"))


def write_raw_manifest(bundle: Path, document: dict[str, Any]) -> None:
    """Write a hand-edited manifest back WITHOUT re-hashing or re-signing — the tamper primitive."""
    (bundle / "release-manifest.json").write_bytes(
        (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    )


# Re-exported so the tests can build variants without re-deriving the fixture values.
document_pin = _document_pin
query_pin = _query_pin
runtime_pin = _runtime
embedding_manifest_fixture = _embedding_manifest
profile_fixture = _profile
versions_fixture = _versions
evaluation_fixture = _evaluation
counts_fixture = _counts
coverage_fixture = _coverage
compatibility_fixture = _compatibility
licence_fixture = _licence
tokenizer_fixture = _tokenizer
