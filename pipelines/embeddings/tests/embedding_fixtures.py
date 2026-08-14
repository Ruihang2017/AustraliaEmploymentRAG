"""Every fixture and fake for the CRPS-05 embeddings suite.

A uniquely named module rather than `conftest`: with no `__init__.py` in the test directories,
pytest imports test modules by bare basename, and `conftest` already exists five times under
`pipelines/`. See `conftest.py` for the full reasoning.

The corpus fixture is built THROUGH THE REAL MODULES — `contracts.schema.create_corpus_database`,
`chunking.chunk_document_version`, `tiering.assign_tiers` — exactly as the ticket's test plan step 1
requires. Nothing here re-implements chunking or tiering; a fixture that re-implemented either
would prove only that the fixture agrees with itself.

The one thing the fixture DOES synthesise is `search_chunk.id`: `SearchChunkDraft` has no `id`
member (CRPS-03 deliverable 3 fixes its eight members), and the row needs a primary key. The
`sc_{node_version_id}_{chunk_ordinal:04d}` form is fixture policy, not spec.
"""

from __future__ import annotations

import array
import hashlib
import json
import socket
import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Sequence

import pytest

from chunking import DEFAULT_PROFILE, NodeVersionInput, chunk_document_version  # noqa: F401
from chunking.profile import ChunkProfile
from contracts.schema import create_corpus_database, open_corpus_database
from contracts.validate import sha256_hex
from embeddings.profile import EmbeddingProfile, LicencePin, ModelArtefactPin, PinnedProfile
from embeddings.profile import runtime_pin_from_dict
from tiering import IndexTier, LicenceStatus, TieringInput, assign_tiers

TS = "2026-07-01T00:00:00Z"
DATE = "2026-07-01"
FILLER_HASH = "a" * 64

#: Deliberately small so a few hundred characters of fixture text produce several chunks and at
#: least one consolidation group. `consolidate_within_provision=True` is what exercises the
#: anchor-span rule the build has to honour (CRPS-03 keeps a consolidated chunk's offsets and
#: `text_hash` on the FIRST participant).
FIXTURE_CHUNK_PROFILE = ChunkProfile(
    profile_id="chunk-embed-fixture-v1",
    target_chars=120,
    max_chars=200,
    min_chars=40,
    overlap_chars=0,
    consolidate_within_provision=True,
    split_strategy="sentence",
)


# ==================================================================================================
# Network isolation (acceptance item 13; test plan step 7)
# ==================================================================================================


@pytest.fixture(scope="session", autouse=True)
def block_all_network() -> Iterator[None]:
    """Fail the whole suite on any outbound connection attempt.

    AUTOUSE on purpose: a fixture the tests must remember to request is a fixture that will be
    forgotten, and "no network at build time" (PRD §19.3, §20.3) is precisely the property that
    must hold even in a test nobody thought to mark. Scoped to this package's conftest so it cannot
    leak into another module's suite.

    Paired with the static scan in `test_embed_source_scan.py`: this catches a call, that catches a
    dependency, and neither alone is sufficient.
    """
    saved = {
        "connect": socket.socket.connect,
        "connect_ex": socket.socket.connect_ex,
        "create_connection": socket.create_connection,
        "getaddrinfo": socket.getaddrinfo,
    }

    def _refuse(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError(
            "the embedding build attempted a network operation; PRD §19.3 and §20.3 keep this "
            "pipeline offline and breakdown plan §8 Q11 forbids any model-hub lookup"
        )

    socket.socket.connect = _refuse  # type: ignore[method-assign]
    socket.socket.connect_ex = _refuse  # type: ignore[method-assign]
    socket.create_connection = _refuse  # type: ignore[assignment]
    socket.getaddrinfo = _refuse  # type: ignore[assignment]
    try:
        yield
    finally:
        socket.socket.connect = saved["connect"]  # type: ignore[method-assign]
        socket.socket.connect_ex = saved["connect_ex"]  # type: ignore[method-assign]
        socket.create_connection = saved["create_connection"]  # type: ignore[assignment]
        socket.getaddrinfo = saved["getaddrinfo"]  # type: ignore[assignment]


# ==================================================================================================
# Profile / pin fixtures — all literal test data, so no test depends on what is installed
# ==================================================================================================


def make_profile(**overrides: Any) -> EmbeddingProfile:
    base = {
        "profile_id": "embed-fixture-v1",
        "model_id": "fixture/tiny-embedder",
        "model_revision": "0000000000000000000000000000000000000000",
        "tokenizer_id": "fixture/tiny-tokenizer",
        "max_tokens": 256,
        "truncation": "head",
        "dimensions": 8,
        "quantisation": "none",
        "normalisation": "l2",
        "distance_metric": "cosine",
        "batch_size": 4,
        "seed": 20260803,
    }
    base.update(overrides)
    return EmbeddingProfile(**base)  # type: ignore[arg-type]


@pytest.fixture
def stub_profile() -> EmbeddingProfile:
    return make_profile()


@pytest.fixture
def licence_pin() -> LicencePin:
    return LicencePin(
        identifier="CC-BY-4.0",
        url="https://creativecommons.org/licenses/by/4.0/",
        attribution_required=True,
        redistribution_permitted=True,
        notes="Fixture licence. PRD §11.1's conservative default applies to weights as to sources.",
    )


#: A complete `RuntimePin` document as LITERAL test data. Breakdown plan §8 Q11's confirmed
#: decision (ONNX Runtime, CPU-only, exactly pinned `ort` crate) supplies the SHAPE; the values are
#: fixture values and no test ever reads them from an installed package or a lockfile.
RUNTIME_PIN_DOCUMENT: dict[str, Any] = {
    "family": "onnxruntime",
    "version": "1.20.1",
    "execution_providers": ["CPUExecutionProvider"],
    "integration": {"crate": "ort", "version": "2.0.0-rc.9"},
    "tokenizer_library": {"crate": "tokenizers", "version": "0.20.3"},
    "pinned_by": "RETR-07",
}


@pytest.fixture
def runtime_pin_fixture() -> Any:
    return runtime_pin_from_dict(dict(RUNTIME_PIN_DOCUMENT))


#: Byte-stable stand-ins for a model artefact and a `tokenizer.json`. NOT a model: this ticket
#: loads no runtime (Q11/RETR-07), it pins and verifies artefacts, and that is what the fixture has
#: to make checkable.
MODEL_ARTEFACT_BYTES = b"taxrag-fixture-model-artefact\x00\x01\x02"
TOKENIZER_ARTEFACT_BYTES = json.dumps(
    {"version": "1.0", "model": {"type": "fixture"}}, sort_keys=True
).encode("utf-8")


@dataclass(frozen=True)
class Artefacts:
    model_path: Path
    tokenizer_path: Path
    model_pin: ModelArtefactPin
    tokenizer_sha256: str


@pytest.fixture
def model_artefacts(tmp_path: Path) -> Artefacts:
    directory = tmp_path / "artefacts"
    directory.mkdir(parents=True, exist_ok=True)
    model_path = directory / "model.onnx"
    tokenizer_path = directory / "tokenizer.json"
    model_path.write_bytes(MODEL_ARTEFACT_BYTES)
    tokenizer_path.write_bytes(TOKENIZER_ARTEFACT_BYTES)
    return Artefacts(
        model_path=model_path,
        tokenizer_path=tokenizer_path,
        model_pin=ModelArtefactPin(
            sha256=hashlib.sha256(MODEL_ARTEFACT_BYTES).hexdigest(),
            byte_size=len(MODEL_ARTEFACT_BYTES),
            format="onnx",
        ),
        tokenizer_sha256=hashlib.sha256(TOKENIZER_ARTEFACT_BYTES).hexdigest(),
    )


@pytest.fixture
def pinned_profile(
    stub_profile: EmbeddingProfile, licence_pin: LicencePin, model_artefacts: Artefacts
) -> PinnedProfile:
    return PinnedProfile(
        profile=stub_profile,
        model_artifact=model_artefacts.model_pin,
        licence=licence_pin,
        tokenizer_artifact_sha256=model_artefacts.tokenizer_sha256,
    )


@pytest.fixture
def out_dir(tmp_path: Path) -> Path:
    return tmp_path / "out"


# ==================================================================================================
# The corpus fixture
# ==================================================================================================

#: One node per tier scenario, plus two deliberately short adjacent siblings that CRPS-03's
#: consolidation rule merges into a single anchor-span chunk. `is_non_ascii` marks the node whose
#: text carries combining marks and a non-BMP character, so character-offset slicing and the
#: hash verification are genuinely exercised rather than assumed (acceptance `[fixture]` item).
_LONG_ASCII = (
    "A registered entity must keep records of every assessable supply it makes. "
    "The records must be retained for five years after the relevant return is lodged. "
    "An entity that fails to retain those records commits an offence of strict liability."
)
_LONG_NON_ASCII = (
    "Ce paragraphe décrit les obligations de conservation des documents comptables. "
    "L'entité doit conserver la déclaration signée pendant cinq années révolues. "
    "Un symbole hors du plan multilingue de base — 𝕏 — apparaît ici volontairement."
)


@dataclass(frozen=True)
class NodeSpec:
    node_version_id: str
    ordinal: int
    text: str
    source_group_id: str
    source_initial_tier: str
    licence_status: LicenceStatus
    permits_indexing: bool
    permits_embedding: bool
    permits_storage: bool
    quarantine_open: bool
    is_evidence_bearing: bool
    parent_node_version_id: str | None = None
    node_kind: str = "SECTION"


NODE_SPECS: tuple[NodeSpec, ...] = (
    NodeSpec(
        node_version_id="nv_tier1_ascii",
        ordinal=0,
        text=_LONG_ASCII,
        source_group_id="grp_primary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
    ),
    NodeSpec(
        node_version_id="nv_tier1_unicode",
        ordinal=1,
        text=_LONG_NON_ASCII,
        source_group_id="grp_primary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
    ),
    NodeSpec(
        node_version_id="nv_tier2",
        ordinal=2,
        text=_LONG_ASCII,
        source_group_id="grp_secondary",
        source_initial_tier="T2",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
    ),
    NodeSpec(
        node_version_id="nv_tier3",
        ordinal=3,
        text=_LONG_ASCII,
        source_group_id="grp_secondary",
        source_initial_tier="T3",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
    ),
    NodeSpec(
        node_version_id="nv_excluded",
        ordinal=4,
        text=_LONG_ASCII,
        source_group_id="grp_secondary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PROHIBITED,
        permits_indexing=False,
        permits_embedding=False,
        permits_storage=False,
        quarantine_open=False,
        is_evidence_bearing=True,
    ),
    NodeSpec(
        node_version_id="nv_quarantined",
        ordinal=5,
        text=_LONG_ASCII,
        source_group_id="grp_primary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=True,
        is_evidence_bearing=True,
    ),
    # Two short adjacent siblings, same parent and kind, consecutive ordinals: CRPS-03 consolidates
    # them into ONE chunk anchored on the first, and the second emits no chunk at all.
    NodeSpec(
        node_version_id="nv_short_a",
        ordinal=6,
        text="Interpretation applies.",
        source_group_id="grp_primary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
        node_kind="PARAGRAPH",
    ),
    NodeSpec(
        node_version_id="nv_short_b",
        ordinal=7,
        text="Definitions apply.",
        source_group_id="grp_primary",
        source_initial_tier="T1",
        licence_status=LicenceStatus.PERMITTED,
        permits_indexing=True,
        permits_embedding=True,
        permits_storage=True,
        quarantine_open=False,
        is_evidence_bearing=True,
        node_kind="PARAGRAPH",
    ),
)


def _tiering_inputs(specs: Sequence[NodeSpec] = NODE_SPECS) -> dict[str, TieringInput]:
    return {
        spec.node_version_id: TieringInput(
            source_group_id=spec.source_group_id,
            source_initial_tier=spec.source_initial_tier,  # type: ignore[arg-type]
            licence_status=spec.licence_status,
            licence_permits_indexing=spec.permits_indexing,
            licence_permits_embedding=spec.permits_embedding,
            licence_permits_storage=spec.permits_storage,
            quarantine_open=spec.quarantine_open,
            document_type="PRIMARY_LEGISLATION",
            legal_status="IN_FORCE",
            is_evidence_bearing=spec.is_evidence_bearing,
            node_char_count=len(spec.text),
        )
        for spec in specs
    }


def _seed_provenance(connection: sqlite3.Connection) -> None:
    """authority -> source -> licence_snapshot -> licence_assessment -> source_artifact -> run.

    Shapes copied from `pipelines/corpus-builder/tests/schema/corpus_seed.py` rather than invented,
    so the DDL's enum CHECKs are satisfied by construction.
    """
    connection.execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level, official_url,"
        " created_at) VALUES ('auth_1', 'Example Authority', 'PARLIAMENT', 'AU-CTH', NULL,"
        " 'https://example.gov.au', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
        " adapter_key, coverage_status, freshness_status, licence_assessment_id, created_at)"
        " VALUES ('src_1', 'grp_primary', 'Example source', 'auth_1', 'AU-CTH',"
        " 'https://example.gov.au', 'leg-cth-example', 'METADATA_AND_LINK_ACTIVE', 'CURRENT',"
        " NULL, ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO licence_snapshot (id, source_id, captured_at, terms_url, terms_sha256,"
        " artifact_key, created_at) VALUES ('lsnap_1', 'src_1', ?, 'https://example.gov.au/terms',"
        " ?, 'terms/1', ?)",
        (TS, FILLER_HASH, TS),
    )
    connection.execute(
        "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
        " indexing, embedding, display, quotation, export, prohibited_use, attribution_text,"
        " max_quote_chars, status, assessed_at, notes_internal, created_at)"
        " VALUES ('lass_1', 'lsnap_1', 1, 1, 1, 1, 1, 1, 1, 0, 'Example attribution', 400,"
        " 'PERMITTED_WITH_ATTRIBUTION', ?, NULL, ?)",
        (TS, TS),
    )
    connection.execute(
        "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
        " etag, last_modified, content_type, byte_length, sha256, r2_key, licence_snapshot_id,"
        " created_at) VALUES ('art_1', 'src_1', 'https://example.gov.au/a', ?, 200, NULL, NULL,"
        " 'text/html', 100, ?, NULL, 'lsnap_1', ?)",
        (TS, FILLER_HASH, TS),
    )
    connection.execute(
        "INSERT INTO ingestion_run (id, source_id, mode, started_at, finished_at, status,"
        " tool_versions_json, failure_code, created_at) VALUES ('run_1', 'src_1', 'FULL', ?, ?,"
        " 'SUCCEEDED', '{}', NULL, ?)",
        (TS, TS, TS),
    )


def _seed_documents(connection: sqlite3.Connection, specs: Sequence[NodeSpec]) -> None:
    connection.execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES ('doc_1', 'src_1', 'PRIMARY_LEGISLATION', 'Example Act 2026', 'C2026A00042',"
        " NULL, NULL, 'C2026A00042', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
        " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
        " content_hash, official_url, created_at) VALUES ('dv_1', 'doc_1', 'art_1', '2026-07-01',"
        " ?, ?, NULL, 'IN_FORCE', ?, ?, 'https://example.gov.au/a', ?)",
        (DATE, DATE, TS, FILLER_HASH, TS),
    )
    for spec in specs:
        text = unicodedata.normalize("NFC", spec.text)
        connection.execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES (?, 'doc_1', ?, ?, ?)",
            (f"dn_{spec.node_version_id}", spec.node_version_id, spec.node_kind, TS),
        )
        connection.execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES (?, 'dv_1', ?, NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?)",
            (
                spec.node_version_id,
                f"dn_{spec.node_version_id}",
                text,
                spec.ordinal,
                DATE,
                sha256_hex(text),
                TS,
            ),
        )


def seed_single_node_document(connection: sqlite3.Connection, canonical_text: str) -> str:
    """Seed the whole provenance chain plus ONE node version holding *canonical_text*.

    Used by the memory probe, which needs a corpus of a given SIZE rather than a corpus of a given
    SHAPE. Returns the `node_version.id`. Shares `_seed_provenance` with `build_corpus` so the
    DDL's NOT NULL and enum constraints are satisfied in one place rather than two.
    """
    text = unicodedata.normalize("NFC", canonical_text)
    _seed_provenance(connection)
    connection.execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES ('doc_1', 'src_1', 'PRIMARY_LEGISLATION', 'Example Act 2026', 'C2026A00042',"
        " NULL, NULL, 'C2026A00042', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
        " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
        " content_hash, official_url, created_at) VALUES ('dv_1', 'doc_1', 'art_1', '2026-07-01',"
        " ?, ?, NULL, 'IN_FORCE', ?, ?, 'https://example.gov.au/a', ?)",
        (DATE, DATE, TS, FILLER_HASH, TS),
    )
    connection.execute(
        "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
        " VALUES ('dn_bulk', 'doc_1', 'bulk', 'SECTION', ?)",
        (TS,),
    )
    connection.execute(
        "INSERT INTO node_version (id, document_version_id, document_node_id,"
        " parent_node_version_id, display_label, heading, canonical_text, ordinal, effective_from,"
        " effective_to, text_hash, created_at)"
        " VALUES ('nv_bulk', 'dv_1', 'dn_bulk', NULL, NULL, NULL, ?, 0, ?, NULL, ?, ?)",
        (text, DATE, sha256_hex(text), TS),
    )
    return "nv_bulk"


def search_chunk_id(node_version_id: str, chunk_ordinal: int) -> str:
    """Fixture policy: `SearchChunkDraft` carries no `id`, and the row needs a primary key."""
    return f"sc_{node_version_id}_{chunk_ordinal:04d}"


@dataclass(frozen=True)
class CorpusFixture:
    path: Path
    #: `search_chunk.id` -> the tier that was actually assigned, for assertions.
    tier_by_chunk: dict[str, IndexTier]
    #: `search_chunk.id` -> the exact text the build must embed.
    text_by_chunk: dict[str, str]
    #: `search_chunk.id` in the order the rows were inserted (NOT the canonical build order).
    insertion_order: tuple[str, ...]

    def eligible_chunk_ids(self, tiers: Sequence[IndexTier]) -> tuple[str, ...]:
        return tuple(sorted(cid for cid, tier in self.tier_by_chunk.items() if tier in tiers))


def build_corpus(
    path: Path,
    *,
    specs: Sequence[NodeSpec] = NODE_SPECS,
    insertion_order: str = "document",
) -> CorpusFixture:
    """Create a corpus database at *path* and fill it through the real CRPS-03/CRPS-04 modules.

    *insertion_order* controls only the physical order `search_chunk` rows are written in
    (`"document"` or `"reverse"`). The build's output must not depend on it — that is the ticket's
    "vector order must not depend on database iteration order" criterion, and the fixture exists to
    make it falsifiable.
    """
    create_corpus_database(path)
    connection = open_corpus_database(path, read_only=False)
    try:
        _seed_provenance(connection)
        _seed_documents(connection, specs)

        nodes = [
            NodeVersionInput(
                node_version_id=spec.node_version_id,
                document_version_id="dv_1",
                parent_node_version_id=spec.parent_node_version_id,
                ordinal=spec.ordinal,
                node_kind=spec.node_kind,
                canonical_text=unicodedata.normalize("NFC", spec.text),
            )
            for spec in specs
        ]
        drafts = chunk_document_version(nodes, FIXTURE_CHUNK_PROFILE)
        assignments = assign_tiers(drafts, _tiering_inputs(specs))

        text_by_node = {node.node_version_id: node.canonical_text for node in nodes}
        rows: list[tuple[str, str, int, int, int, str, str]] = []
        tier_by_chunk: dict[str, IndexTier] = {}
        text_by_chunk: dict[str, str] = {}
        for draft, assignment in zip(drafts, assignments, strict=True):
            chunk_id = search_chunk_id(draft.node_version_id, draft.chunk_ordinal)
            rows.append(
                (
                    chunk_id,
                    draft.node_version_id,
                    draft.chunk_ordinal,
                    draft.start_offset,
                    draft.end_offset,
                    draft.text_hash,
                    assignment.tier.value,
                )
            )
            tier_by_chunk[chunk_id] = assignment.tier
            text_by_chunk[chunk_id] = text_by_node[draft.node_version_id][
                draft.start_offset : draft.end_offset
            ]

        ordered = list(rows) if insertion_order == "document" else list(reversed(rows))
        for row in ordered:
            connection.execute(
                "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
                " end_offset, text_hash, index_tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (*row, TS),
            )
    finally:
        connection.close()

    return CorpusFixture(
        path=path,
        tier_by_chunk=tier_by_chunk,
        text_by_chunk=text_by_chunk,
        insertion_order=tuple(row[0] for row in ordered),
    )


@pytest.fixture
def corpus_fixture(tmp_path: Path) -> CorpusFixture:
    return build_corpus(tmp_path / "corpus" / "corpus.sqlite")


# ==================================================================================================
# The dependency-free vector writer fake
# ==================================================================================================


class RecordingWriter:
    """A `VectorIndexWriter` that records what it was handed, in call order.

    This is what lets the eligibility, ordering, resume, guard, pin, counting and determinism
    criteria all run with ZERO third-party imports. Only the criteria that are genuinely about the
    USearch file's bytes sit behind the availability guard in `test_embed_vector_file.py`.

    `finalise()` writes a deterministic pure-Python serialisation, so "two runs produce identical
    vector bytes" is still a real byte comparison here — of our own format rather than USearch's.
    """

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[float, ...]]] = []
        self.finalised_to: Path | None = None

    def add(self, vector_key: str, vector: "array.array[float]") -> None:
        self.calls.append((vector_key, tuple(vector)))

    def finalise(self, path: Path) -> Any:
        from embeddings.vectors import VectorFileStat

        payload = b"".join(
            key.encode("utf-8") + b"\x00" + array.array("f", values).tobytes()
            for key, values in self.calls
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)
        self.finalised_to = path
        return VectorFileStat(
            sha256=hashlib.sha256(payload).hexdigest(),
            byte_size=len(payload),
            count=len(self.calls),
        )

    @property
    def keys(self) -> tuple[str, ...]:
        return tuple(key for key, _ in self.calls)
