"""The known-good candidate baseline every CRPS-06 test varies exactly one thing from.

NOT named `conftest.py` — see `candidate_paths.py` for the `sys.modules` collision that rule exists
to avoid. `tests/build/conftest.py` and `tests/validation/conftest.py` both re-export from here, so
the build suite and the gate suite exercise ONE baseline: a second, separately maintained baseline
would let a gate test pass against a corpus the build tests never build.

WHAT THE FACTORY COMPOSES. The real earlier tickets, not hand-written substitutes:
`contracts.schema.create_corpus_database()` (CRPS-01), `chunking.chunk_node_version()` (CRPS-03),
`tiering`'s `IndexTier` (CRPS-04), `manifest`'s pin dataclasses and the committed development
keypair (CRPS-02). The model and runtime pins are LITERAL TEST DATA supplied here; nothing reads the
machine, which is the property `test_no_environment_inference.py` asserts over the production trees.

`usearch` IS NEVER IMPORTED. It is declared but not installed in this workspace (FND-01), so the
vector artifact is a deterministic opaque blob written by `_write_vector_file()` below. Nothing in
this ticket parses it — `assemble.py` copies it and the manifest hashes it, and that is the entire
contract this module has with CRPS-05's output.

THE LEXICAL INDEX. `FixtureLexicalIndexBuilder` stands in for whatever
`docs/adr/0003-offline-lexical-index-builder.md` selects. It reports a real `index_version`, because
a `CANDIDATE` built with `NullLexicalIndexBuilder` is a BLOCKING gate failure by design — that is
the point of `INDEX_BUILDER_NULL_ON_CANDIDATE`, and the baseline must be able to pass.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

import pytest
from candidate_paths import (  # noqa: F401  (imported for the sys.path side effect too)
    DEV_PRIVATE_KEYFILE,
    DEV_PUBLIC_KEYFILE,
    DEV_SIGNER_ID,
    SRC,
)

from chunking import DEFAULT_PROFILE, NodeVersionInput, chunk_node_version
from contracts.schema import create_corpus_database, open_corpus_database
from contracts.validate import sha256_hex
from contracts.version import BUILDER_VERSION, CONTRACT_VERSION, SCHEMA_VERSION
from manifest import (
    CompatibilityRange,
    CompatibilityRanges,
    CratePin,
    Determinism,
    EmbeddingManifest,
    Licence,
    ModelArtifact,
    ModelPin,
    RuntimePin,
    TierSelection,
    Tokenizer,
    VectorFile,
    Versions,
    public_keys_from,
    write_manifest,
)
from tiering import IndexTier
from validation.context import BundleContext, read_only_connector
from validation.evaluation_report import load_evaluation_report
from validation.source_groups import MANDATORY_SOURCE_GROUPS

from build import BuildRequest, IndexBuildResult

TS = "2026-01-01T00:00:00Z"
DATE_2019 = "2019-07-01"
DATE_2022 = "2022-07-01"
DATE_2024 = "2024-01-01"
HASH64 = "a" * 64

PROFILE_ID = "fixture-embedding-profile"
DIMENSIONS = 8

#: Two invented documents. No real instrument, no real case, no real party, no real ABN — the same
#: rule `fixtures/generator/synthetic_corpus.py` records (PRD §40.8 item 4).
_ACT_TEXT_2019 = (
    "14 Liability to pay the synthetic levy. A registered entity is liable to pay the synthetic "
    "levy for a levy year if the entity carried on a notional enterprise at any time during that "
    "year. The amount of the levy is worked out under section 15 of this invented Act, which has "
    "no counterpart in any real statute book and is used here only so that offsets, hashes and "
    "point-in-time resolution have something concrete to operate on."
)
_ACT_TEXT_2022 = (
    "14 Liability to pay the synthetic levy. A registered entity is liable to pay the synthetic "
    "levy for a levy year if the entity carried on a notional enterprise at any time during that "
    "year and its notional turnover for the year exceeded the threshold amount. The threshold "
    "amount is worked out under section 15A of this invented Act, inserted by the invented "
    "amending Act referred to in the accompanying event rows."
)
_DECISION_TEXT = (
    "The Commission is satisfied that the notional employer contravened the invented clause 12 of "
    "the invented award by failing to pay the synthetic loading. Nothing in these reasons refers "
    "to any real employer, employee, award or proceeding; the text exists so that a neutral "
    "citation lookup and an employer identifier lookup have a row to resolve to."
)


# ==================================================================================================
# Fixture-grade builders standing in for the real mechanisms
# ==================================================================================================


class FixtureLexicalIndexBuilder:
    """A deterministic stand-in for the ADR-selected offline lexical index builder.

    It writes opaque bytes: `tantivy/`'s contents are opaque to `04-corpus-contract` by design
    (deliverable 3), and only presence, `index_version` and file hashes are this module's business.
    """

    builder_id = "fixture-lexical-index-builder"
    index_version = "fixture-index-1.0.0"

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        connection = open_corpus_database(corpus_db, read_only=True)
        try:
            doc_count = int(connection.execute("SELECT COUNT(*) FROM search_chunk").fetchone()[0])
        finally:
            connection.close()
        (out_dir / "meta.json").write_bytes(
            (
                json.dumps(
                    {"index_version": self.index_version, "doc_count": doc_count},
                    sort_keys=True,
                    indent=2,
                )
                + "\n"
            ).encode("utf-8")
        )
        (out_dir / "segment.bin").write_bytes(b"fixture-lexical-segment\n")
        files = [path for path in out_dir.rglob("*") if path.is_file()]
        return IndexBuildResult(
            index_version=self.index_version,
            file_count=len(files),
            byte_size=sum(path.stat().st_size for path in files),
            doc_count=doc_count,
            builder_id=self.builder_id,
        )


def _write_vector_file(path: Path, count: int) -> None:
    """A deterministic opaque vector artifact. Deliberately NOT a parseable usearch index.

    A consumer that tries to open it fails loudly, which is strictly better than a valid empty index
    that would silently return no neighbours and look like a retrieval quality problem — the same
    reasoning CRPS-08 records for its own placeholder.
    """
    body = b"".join(
        hashlib.blake2b(f"fixture-vector:{index}".encode("utf-8"), digest_size=DIMENSIONS).digest()
        for index in range(count)
    )
    path.write_bytes(b"TAXRAG-FIXTURE-VECTORS\n" + body)


# ==================================================================================================
# Pins — literal test data, never read from the machine
# ==================================================================================================


def fixture_licence() -> Licence:
    return Licence(
        identifier="FIXTURE-MODEL-LICENCE",
        url="https://example.invalid/licence",
        attribution_required=True,
        redistribution_permitted=False,
        notes=None,
    )


def fixture_tokenizer() -> Tokenizer:
    return Tokenizer(id="fixture/tokenizer", artifact_sha256="b" * 64, max_tokens=512, truncation="RIGHT")


def fixture_runtime() -> RuntimePin:
    return RuntimePin(
        family="onnxruntime",
        version="1.20.0",
        execution_providers=("CPU",),
        integration=CratePin(crate="ort", version="2.0.0-rc.9"),
        tokenizer_library=CratePin(crate="tokenizers", version="0.20.3"),
        pinned_by="RETR-07-compatibility-verification-fixture",
    )


def fixture_document_pin() -> ModelPin:
    tokenizer = fixture_tokenizer()
    return ModelPin(
        role="DOCUMENT_EMBEDDING",
        model_id="fixture/document-embedding",
        model_revision="rev-000000000000000000000001",
        model_artifact=ModelArtifact(sha256="c" * 64, byte_size=4096, format="onnx"),
        dimensions=DIMENSIONS,
        normalisation="L2",
        truncation=tokenizer.truncation,
        max_tokens=tokenizer.max_tokens,
        tokenizer=tokenizer,
        licence=fixture_licence(),
        bundle_path=None,
    )


def fixture_query_pin() -> ModelPin:
    return replace(fixture_document_pin(), role="QUERY_EMBEDDING")


def fixture_versions() -> Versions:
    return Versions(
        schema=SCHEMA_VERSION,
        parser="1.0.0",
        chunker="1.0.0",
        embedding="1.0.0",
        # Overwritten by `assemble` from the index builder's own report; a placeholder here proves
        # the request never gets to state an index version the build did not produce.
        index="IGNORED-REPLACED-BY-INDEX-BUILDER",
        builder=BUILDER_VERSION,
        contract=CONTRACT_VERSION,
    )


def fixture_compatibility() -> CompatibilityRanges:
    return CompatibilityRanges(
        app=CompatibilityRange(min="0.1.0", max=None),
        search=CompatibilityRange(min="0.1.0", max=None),
        corpus_schema=SCHEMA_VERSION,
    )


# ==================================================================================================
# The corpus
# ==================================================================================================


def _insert_source(
    connection: sqlite3.Connection,
    *,
    index: int,
    group: str,
    coverage_status: str,
    freshness_status: str,
    fetched: int,
    parsed: int,
) -> str:
    source_id = f"src_{index:03d}"
    snapshot_id = f"lsnap_{index:03d}"
    assessment_id = f"lass_{index:03d}"
    artifact_id = f"art_{index:03d}"
    run_id = f"run_{index:03d}"
    connection.execute(
        "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
        " adapter_key, coverage_status, freshness_status, licence_assessment_id,"
        " last_discovery_at, last_ingestion_at, created_at)"
        " VALUES (?, ?, ?, 'auth_1', 'AU', 'https://example.invalid', ?, ?, ?, ?, ?, ?, ?)",
        (
            source_id,
            group,
            f"{group} official entry (fixture)",
            f"adapter-{group.lower()}",
            coverage_status,
            freshness_status,
            assessment_id,
            TS,
            TS,
            TS,
        ),
    )
    connection.execute(
        "INSERT INTO licence_snapshot (id, source_id, captured_at, terms_url, terms_sha256,"
        " artifact_key, created_at) VALUES (?, ?, ?, 'https://example.invalid/terms', ?, NULL, ?)",
        (snapshot_id, source_id, TS, HASH64, TS),
    )
    connection.execute(
        "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
        " indexing, embedding, display, quotation, export, prohibited_use, attribution_text,"
        " max_quote_chars, status, assessed_at, notes_internal, created_at)"
        " VALUES (?, ?, 1, 1, 1, 1, 1, 1, 1, 0, 'Fixture attribution', 400, 'PERMITTED', ?, NULL, ?)",
        (assessment_id, snapshot_id, TS, TS),
    )
    connection.execute(
        "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
        " etag, last_modified, content_type, byte_length, sha256, r2_key, licence_snapshot_id,"
        " created_at) VALUES (?, ?, 'https://example.invalid/a', ?, 200, NULL, NULL, 'text/html',"
        " 1024, ?, NULL, ?, ?)",
        (artifact_id, source_id, TS, HASH64, snapshot_id, TS),
    )
    connection.execute(
        "INSERT INTO ingestion_run (id, source_id, mode, started_at, finished_at, status,"
        " discovered_count, fetched_count, changed_count, parsed_count, quarantined_count,"
        " tool_versions_json, failure_code, created_at)"
        " VALUES (?, ?, 'FULL', ?, ?, 'SUCCEEDED', ?, ?, 0, ?, 0, '{}', NULL, ?)",
        (run_id, source_id, TS, TS, fetched, fetched, parsed, TS),
    )
    return artifact_id


def _insert_node_version(
    connection: sqlite3.Connection,
    *,
    node_version_id: str,
    document_version_id: str,
    document_node_id: str,
    text: str,
    ordinal: int,
    effective_from: str | None,
    effective_to: str | None,
) -> None:
    connection.execute(
        "INSERT INTO node_version (id, document_version_id, document_node_id,"
        " parent_node_version_id, display_label, heading, canonical_text, ordinal, effective_from,"
        " effective_to, text_hash, created_at)"
        " VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)",
        (
            node_version_id,
            document_version_id,
            document_node_id,
            text,
            ordinal,
            effective_from,
            effective_to,
            sha256_hex(text),
            TS,
        ),
    )


def _insert_chunks(
    connection: sqlite3.Connection,
    *,
    node_version_id: str,
    text: str,
    tier: str,
    embed: bool,
) -> int:
    """Chunk with the REAL CRPS-03 chunker and persist the drafts. Returns the chunk count."""
    node = NodeVersionInput(
        node_version_id=node_version_id,
        document_version_id="ignored-by-the-chunker",
        parent_node_version_id=None,
        ordinal=0,
        node_kind="SECTION",
        canonical_text=text,
    )
    drafts = chunk_node_version(node, DEFAULT_PROFILE)
    for draft in drafts:
        chunk_id = f"chk_{node_version_id}_{draft.chunk_ordinal}"
        connection.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                chunk_id,
                node_version_id,
                draft.chunk_ordinal,
                draft.start_offset,
                draft.end_offset,
                draft.text_hash,
                tier,
                TS,
            ),
        )
        if embed:
            connection.execute(
                "INSERT INTO chunk_embedding (search_chunk_id, profile_id, vector_key, dimensions,"
                " quantisation) VALUES (?, ?, ?, ?, 'FLOAT32')",
                (chunk_id, PROFILE_ID, f"vec/{chunk_id}", DIMENSIONS),
            )
    return len(drafts)


def build_corpus(
    path: Path,
    *,
    release_id: str,
    coverage_overrides: Mapping[str, str] | None = None,
    omit_groups: Sequence[str] = (),
    parse_counts: Mapping[str, tuple[int, int]] | None = None,
    open_quarantine: bool = False,
    extra_documents: int = 0,
    customise: Callable[[sqlite3.Connection], None] | None = None,
) -> None:
    """Write a complete, gate-passing corpus database at *path*.

    `customise` receives the READ-WRITE connection just AFTER commit, so a test can introduce
    exactly one defect — including SQL a well-formed database forbids, such as dropping a UNIQUE
    index before inserting a duplicate. That is how the identity gate's fail case is written: the
    gate exists precisely because a hand-built or tampered database may lack the index.
    """
    create_corpus_database(path, release_id=release_id)
    connection = open_corpus_database(path, read_only=False)
    try:
        connection.execute("BEGIN")
        connection.execute(
            "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level,"
            " official_url, created_at)"
            " VALUES ('auth_1', 'Fixture Authority', 'PARLIAMENT', 'AU', NULL,"
            " 'https://example.invalid', ?)",
            (TS,),
        )

        overrides = dict(coverage_overrides or {})
        counts = dict(parse_counts or {})
        artifact_by_group: dict[str, str] = {}
        index = 0
        for group in MANDATORY_SOURCE_GROUPS:
            if group in omit_groups:
                continue
            index += 1
            fetched, parsed = counts.get(group, (10, 10))
            artifact_by_group[group] = _insert_source(
                connection,
                index=index,
                group=group,
                coverage_status=overrides.get(group, "METADATA_AND_LINK_ACTIVE"),
                freshness_status="CURRENT",
                fetched=fetched,
                parsed=parsed,
            )

        first_group = next(iter(artifact_by_group))
        # -- document 1: a two-version consolidated series ---------------------------------------
        connection.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
            " VALUES ('doc_act', ?, 'PRIMARY_LEGISLATION', 'Synthetic Levy Act 2019',"
            " 'C2019A00042', NULL, NULL, 'C2019A00042', ?)",
            (f"src_{list(artifact_by_group).index(first_group) + 1:03d}", TS),
        )
        for version_id, label, start, end, status in (
            ("dv_act_1", "2019-07-01", DATE_2019, DATE_2022, "SUPERSEDED"),
            ("dv_act_2", "2022-07-01", DATE_2022, None, "IN_FORCE"),
        ):
            connection.execute(
                "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
                " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
                " content_hash, official_url, created_at)"
                " VALUES (?, 'doc_act', ?, ?, ?, ?, ?, ?, ?, ?, 'https://example.invalid/a', ?)",
                (
                    version_id,
                    artifact_by_group[first_group],
                    label,
                    start,
                    start,
                    end,
                    status,
                    TS,
                    HASH64,
                    TS,
                ),
            )
        connection.execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES ('node_act_s14', 'doc_act', 's14', 'SECTION', ?)",
            (TS,),
        )
        _insert_node_version(
            connection,
            node_version_id="nv_act_1",
            document_version_id="dv_act_1",
            document_node_id="node_act_s14",
            text=_ACT_TEXT_2019,
            ordinal=0,
            effective_from=DATE_2019,
            effective_to=DATE_2022,
        )
        _insert_node_version(
            connection,
            node_version_id="nv_act_2",
            document_version_id="dv_act_2",
            document_node_id="node_act_s14",
            text=_ACT_TEXT_2022,
            ordinal=0,
            effective_from=DATE_2022,
            effective_to=None,
        )
        connection.execute(
            "INSERT INTO node_relation (id, from_node_version_id, to_node_version_id,"
            " relation_type, evidence_node_version_id, evidence_start, evidence_end, derivation,"
            " parser_version, confidence_state, created_at)"
            " VALUES ('nrel_1', 'nv_act_2', 'nv_act_1', 'AMENDS', 'nv_act_2', 0, 40,"
            " 'phrase match', '1.0.0', 'PARSER_DETERMINISTIC', ?)",
            (TS,),
        )
        connection.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES ('evt_1', 'doc_act', 'COMMENCEMENT', ?, ?, 'nv_act_1', 'dv_act_1', NULL, ?)",
            (DATE_2019, DATE_2019, TS),
        )
        connection.execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES ('evt_2', 'doc_act', 'PUBLICATION', ?, NULL, NULL, 'dv_act_2', NULL, ?)",
            (DATE_2022, TS),
        )

        # -- document 2: a decision, carrying the neutral-citation and ABN probe classes ----------
        second_group = list(artifact_by_group)[1]
        connection.execute(
            "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
            " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
            " VALUES ('doc_case', ?, 'DECISION', 'Notional Employer Decision',"
            " NULL, '[2024] SYNIRC 7', '53000000928', 'SYNIRC-2024-7', ?)",
            (f"src_{list(artifact_by_group).index(second_group) + 1:03d}", TS),
        )
        connection.execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at)"
            " VALUES ('dv_case_1', 'doc_case', ?, '2024-01-01', ?, ?, NULL, 'IN_FORCE', ?, ?,"
            " 'https://example.invalid/b', ?)",
            (artifact_by_group[second_group], DATE_2024, DATE_2024, TS, HASH64, TS),
        )
        connection.execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES ('node_case_p12', 'doc_case', 'p12', 'PARAGRAPH', ?)",
            (TS,),
        )
        _insert_node_version(
            connection,
            node_version_id="nv_case_1",
            document_version_id="dv_case_1",
            document_node_id="node_case_p12",
            text=_DECISION_TEXT,
            ordinal=0,
            effective_from=DATE_2024,
            effective_to=None,
        )

        for extra in range(extra_documents):
            document_id = f"doc_extra_{extra}"
            connection.execute(
                "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
                " official_identifier, neutral_citation, employer_abn, stable_source_key,"
                " created_at) VALUES (?, ?, 'GUIDANCE', ?, NULL, NULL, NULL, ?, ?)",
                (
                    document_id,
                    f"src_{list(artifact_by_group).index(first_group) + 1:03d}",
                    f"Extra fixture document {extra}",
                    f"EXTRA-{extra}",
                    TS,
                ),
            )

        for node_version_id, text in (
            ("nv_act_1", _ACT_TEXT_2019),
            ("nv_act_2", _ACT_TEXT_2022),
            ("nv_case_1", _DECISION_TEXT),
        ):
            _insert_chunks(
                connection,
                node_version_id=node_version_id,
                text=text,
                tier=IndexTier.TIER_1_FULL_SEMANTIC.value,
                embed=True,
            )

        connection.execute(
            "INSERT INTO quarantine_item (id, ingestion_run_id, artifact_id, reason_code,"
            " details_json, status, resolution, resolved_at, created_at)"
            " VALUES ('qi_resolved', 'run_001', NULL, 'PARSE_DEFECT', NULL, 'RESOLVED',"
            " 'reparsed', ?, ?)",
            (TS, TS),
        )
        if open_quarantine:
            connection.execute(
                "INSERT INTO quarantine_item (id, ingestion_run_id, artifact_id, reason_code,"
                " details_json, status, resolution, resolved_at, created_at)"
                " VALUES ('qi_open', 'run_001', NULL, 'OCR_DEFECT', NULL, 'OPEN', NULL, NULL, ?)",
                (TS,),
            )

        connection.execute("COMMIT")
        # AFTER the commit, deliberately: `PRAGMA foreign_keys` and `PRAGMA
        # ignore_check_constraints` are no-ops inside a transaction, and a test that needs to
        # simulate a hand-built or tampered database needs both.
        if customise is not None:
            customise(connection)
    finally:
        connection.close()


# ==================================================================================================
# The embedding output directory (CRPS-05's artifacts, as this ticket consumes them)
# ==================================================================================================


def build_embedding_dir(
    directory: Path,
    *,
    corpus_db: Path,
    release_id: str,
    document_pin: ModelPin,
    runtime: RuntimePin,
    overrides: Mapping[str, Any] | None = None,
    write_report: bool = True,
) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    connection = open_corpus_database(corpus_db, read_only=True)
    try:
        chunk_count = int(connection.execute("SELECT COUNT(*) FROM search_chunk").fetchone()[0])
        embedded = int(connection.execute("SELECT COUNT(*) FROM chunk_embedding").fetchone()[0])
    finally:
        connection.close()

    vector_path = directory / "vectors.usearch"
    _write_vector_file(vector_path, embedded)
    embedding = EmbeddingManifest(
        manifest_version="1.0.0",
        profile_id=PROFILE_ID,
        model_id=document_pin.model_id,
        model_revision=document_pin.model_revision,
        model_artifact=document_pin.model_artifact,
        licence=document_pin.licence,
        tokenizer=document_pin.tokenizer,
        dimensions=DIMENSIONS,
        quantisation="FLOAT32",
        normalisation=document_pin.normalisation,
        distance_metric="COSINE",
        runtime=runtime,
        built_at=TS,
        builder_version=BUILDER_VERSION,
        input_contract_version=CONTRACT_VERSION,
        tier_selection=TierSelection(
            tiers=(IndexTier.TIER_1_FULL_SEMANTIC.value,),
            chunk_count=chunk_count,
            embedded_count=embedded,
            skipped_count=chunk_count - embedded,
        ),
        vector_file=VectorFile(
            path="vectors.usearch",
            sha256=hashlib.sha256(vector_path.read_bytes()).hexdigest(),
            byte_size=vector_path.stat().st_size,
            count=embedded,
        ),
        determinism=Determinism(seed=7, deterministic=True),
        source_release_id=release_id,
    )
    document = embedding.to_dict()
    if overrides:
        document = _deep_merge(document, dict(overrides))
    write_manifest(
        (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
        directory / "embedding-manifest.json",
    )
    if write_report:
        (directory / "embedding-build-report.json").write_bytes(
            (
                json.dumps(
                    {
                        "profile_id": PROFILE_ID,
                        "chunk_count": chunk_count,
                        "embedded_count": embedded,
                        "skipped_count": chunk_count - embedded,
                    },
                    sort_keys=True,
                    indent=2,
                )
                + "\n"
            ).encode("utf-8")
        )


def _deep_merge(base: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


# ==================================================================================================
# The evaluation report (21-evaluation-600's output, as this ticket consumes it)
# ==================================================================================================


def write_evaluation_report(path: Path, *, passing: bool = True, malformed: bool = False) -> None:
    if malformed:
        # A JSON NUMBER where the contract requires a decimal string. Malformed, not missing.
        path.write_text(
            json.dumps(
                {
                    "report_id": "eval-0001",
                    "ran_at": TS,
                    "metrics": {"recall_at_10": 0.87},
                    "gates": [],
                }
            ),
            encoding="utf-8",
        )
        return
    path.write_text(
        json.dumps(
            {
                "report_id": "eval-0001",
                "ran_at": TS,
                "metrics": {"recall_at_10": "0.87", "broken_gold_citations": "0"},
                "gates": [
                    {
                        "name": "recall_at_10",
                        "threshold": "0.80",
                        "observed": "0.87" if passing else "0.61",
                        "passed": passing,
                    }
                ],
            },
            sort_keys=True,
            indent=2,
        ),
        encoding="utf-8",
    )


# ==================================================================================================
# The factory
# ==================================================================================================


@dataclass
class Candidate:
    """One complete set of build inputs, plus the helpers a test varies them with."""

    root: Path
    corpus_db: Path
    embedding_dir: Path
    output_dir: Path
    evaluation_report_path: Path | None
    release_id: str
    release_kind: str
    model_pins: tuple[ModelPin, ...]
    runtime_pin: RuntimePin | None
    sign: bool

    def request(self, **overrides: Any) -> BuildRequest:
        fields: dict[str, Any] = {
            "corpus_db_path": self.corpus_db,
            "embedding_dir": self.embedding_dir,
            "output_dir": self.output_dir,
            "release_id": self.release_id,
            "versions": fixture_versions(),
            "compatibility": fixture_compatibility(),
            "local_model_pins": self.model_pins,
            "runtime_pin": self.runtime_pin,
            "embedding_profile_id": PROFILE_ID,
            "chunk_profile_id": DEFAULT_PROFILE.profile_id,
            "public_key_paths": (DEV_PUBLIC_KEYFILE,),
            "release_kind": self.release_kind,
            "evaluation_report_path": self.evaluation_report_path,
            "signing_key_path": DEV_PRIVATE_KEYFILE if self.sign else None,
            "signing_key_id": DEV_SIGNER_ID if self.sign else None,
        }
        fields.update(overrides)
        return BuildRequest(**fields)

    def index_builder(self) -> FixtureLexicalIndexBuilder:
        return FixtureLexicalIndexBuilder()

    def connect(self) -> sqlite3.Connection:
        return open_corpus_database(self.corpus_db, read_only=True)

    def phase_a_context(self, **overrides: Any) -> BundleContext:
        """A phase-A `BundleContext` over the INPUTS, for a gate test that needs no bundle.

        Phase A runs before any bundle exists, so `paths` and `public_keys` are unused by gates 1-7
        and by the pin preflight; only gate 8's phase-B verification reads them.
        """
        request = overrides.pop("request", None) or self.request()
        embedding = json.loads(
            (self.embedding_dir / "embedding-manifest.json").read_text(encoding="utf-8")
        )
        report_path = self.embedding_dir / "embedding-build-report.json"
        report = (
            json.loads(report_path.read_text(encoding="utf-8")) if report_path.is_file() else None
        )
        evaluation = None
        if request.evaluation_report_path is not None:
            evaluation, _ = load_evaluation_report(request.evaluation_report_path)
        index_result = overrides.pop(
            "index_result",
            IndexBuildResult(
                index_version=FixtureLexicalIndexBuilder.index_version,
                file_count=2,
                byte_size=100,
                doc_count=3,
                builder_id=FixtureLexicalIndexBuilder.builder_id,
            ),
        )
        fields: dict[str, Any] = {
            "request": request,
            "paths": None,
            "connect": read_only_connector(self.corpus_db),
            "parent_connect": None,
            "embedding_manifest": embedding,
            "embedding_report": report,
            "index_result": index_result,
            "index_builder_id": index_result.builder_id,
            "public_keys": public_keys_from(DEV_PUBLIC_KEYFILE),
            "declared_counts": None,
            "evaluation_report": evaluation,
        }
        fields.update(overrides)
        return BundleContext(**fields)


@pytest.fixture
def candidate_factory(tmp_path: Path) -> Callable[..., Candidate]:
    """Build a known-good candidate's INPUTS. Every gate test varies exactly one thing."""
    counter = {"n": 0}

    def factory(
        *,
        release_id: str | None = None,
        release_kind: str = "CANDIDATE",
        coverage_overrides: Mapping[str, str] | None = None,
        omit_groups: Sequence[str] = (),
        parse_counts: Mapping[str, tuple[int, int]] | None = None,
        open_quarantine: bool = False,
        extra_documents: int = 0,
        customise: Callable[[sqlite3.Connection], None] | None = None,
        model_pins: tuple[ModelPin, ...] | None = None,
        runtime_pin: RuntimePin | None = None,
        embedding_overrides: Mapping[str, Any] | None = None,
        write_embedding_report: bool = True,
        evaluation: str = "pass",
        sign: bool = True,
    ) -> Candidate:
        counter["n"] += 1
        root = tmp_path / f"candidate-{counter['n']}"
        root.mkdir()
        identifier = release_id or f"rel-{counter['n']:04d}"

        corpus_db = root / "input" / "corpus.sqlite"
        build_corpus(
            corpus_db,
            release_id=identifier,
            coverage_overrides=coverage_overrides,
            omit_groups=omit_groups,
            parse_counts=parse_counts,
            open_quarantine=open_quarantine,
            extra_documents=extra_documents,
            customise=customise,
        )

        pins = model_pins if model_pins is not None else (fixture_document_pin(), fixture_query_pin())
        runtime = runtime_pin if runtime_pin is not None else fixture_runtime()
        document_pin = next(
            (pin for pin in pins if pin.role == "DOCUMENT_EMBEDDING"), fixture_document_pin()
        )
        embedding_dir = root / "embeddings"
        build_embedding_dir(
            embedding_dir,
            corpus_db=corpus_db,
            release_id=identifier,
            document_pin=document_pin,
            runtime=runtime if runtime is not None else fixture_runtime(),
            overrides=embedding_overrides,
            write_report=write_embedding_report,
        )

        evaluation_path: Path | None = root / "evaluation-report.json"
        if evaluation == "missing":
            evaluation_path = None
        elif evaluation == "absent-file":
            # The path is supplied but the file is not there — distinct from supplying no path.
            evaluation_path = root / "no-such-evaluation-report.json"
        else:
            assert evaluation_path is not None
            write_evaluation_report(
                evaluation_path,
                passing=evaluation != "fail",
                malformed=evaluation == "malformed",
            )

        return Candidate(
            root=root,
            corpus_db=corpus_db,
            embedding_dir=embedding_dir,
            output_dir=root / "out",
            evaluation_report_path=evaluation_path,
            release_id=identifier,
            release_kind=release_kind,
            model_pins=pins,
            runtime_pin=runtime,
            sign=sign,
        )

    return factory


@pytest.fixture
def trusted_keys() -> dict[str, bytes]:
    return public_keys_from(DEV_PUBLIC_KEYFILE)
