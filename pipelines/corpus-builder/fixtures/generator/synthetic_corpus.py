"""Deterministic generation of the synthetic `corpus.sqlite` (CRPS-08 deliverable 1).

EVERYTHING HERE IS INVENTED. No real legislative text, no real case, no real party, no real ABN, no
customer data of any kind (PRD §40.8 item 4). The instruments below do not exist; the identifiers are
shaped like the real ones so exact-identifier retrieval (`SRCH-004`) is testable, and nothing more.

DETERMINISM (deliverable 4) is the property the committed artifact depends on, and it is achieved by
four rules that must all hold:

1. Ids are derived from `(seed, kind, ordinal)` with BLAKE2b and shaped into FND-03's
   `<prefix>_<UUIDv7>` form. No version-4 UUID, no randomness, no clock — a test greps this
   package's sources for those spellings, because one reintroduced random id would silently make
   the committed bundle unreproducible. (The forbidden spellings are therefore not written out
   here: the scanner reads this file too.)
2. Every timestamp and date is a constant from `_paths` or from the literal dataset below.
3. Insert order is fixed and explicit: one `BEGIN … COMMIT`, statements in written order, never an
   iteration over a `set` or over a `dict` whose construction order could drift.
4. `create_corpus_database()` stamps `corpus_meta.built_at`/`created_at` from the wall clock, so the
   row is re-pinned by an `UPDATE` immediately afterwards. That is legal — `corpus_meta` is the one
   table with no immutability trigger (`schema/corpus/001_corpus_schema.sql`) — and it is what makes
   the file byte-reproducible at all. The build then ends in `VACUUM`, so the page layout depends on
   the final content rather than on the insert history, and WAL is never enabled (it changes the
   header and leaves `-wal`/`-shm` files that would then trip `BUNDLE_FILE_UNLISTED`).

PENDING ENUM VOCABULARIES. `legal_document.document_type`, `document_node.node_kind`,
`node_relation.relation_type`, `node_relation.confidence_state`, `legal_event.event_type`,
`quarantine_item.status`, `source.freshness_status`, `ingestion_run.{mode,status}` and
`authority.{authority_type,court_level}` are plain TEXT with no CHECK — `packages/contracts`
publishes no family for them yet (Q-CRPS-4 / FND-03). The spellings used below are the ones the
existing seed helper (`tests/schema/corpus_seed.py`) already uses. Inventing a competing vocabulary
here, or hand-adding values to `002_enums.map.json` (another ticket's file), is expressly forbidden.
"""

from __future__ import annotations

import hashlib
import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from ._paths import BASE_DATE, BASE_TIMESTAMP, ID_TIMESTAMP_MS, RELEASE_ID, SEED_DEFAULT, ensure_src_on_path

ensure_src_on_path()

from contracts.schema import create_corpus_database, open_corpus_database  # noqa: E402
from contracts.validate import CORPUS_ID_PATTERN, sha256_hex  # noqa: E402

__all__ = ["CorpusStats", "CoverageFigures", "abn_is_valid", "generate_corpus", "synthetic_abn"]

TS = BASE_TIMESTAMP

# The three time points the Act-like document is effective at (PRD §40.8 item 6).
DATE_2019 = "2019-07-01"
DATE_2022 = "2022-07-01"
DATE_2025 = "2025-07-01"
DATE_2022_EVE = "2022-06-30"
DATE_2025_EVE = "2025-06-30"

# The two source groups — one Commonwealth-like, one state-like (PRD §6.2/§6.3 scope shape).
GROUP_CTH = "syn-cth-primary"
GROUP_NSW = "syn-nsw-primary"


# ==================================================================================================
# Identifiers
# ==================================================================================================


def _mint(seed: int, prefix: str, kind: str, ordinal: int) -> str:
    """FND-03's opaque id: `<prefix>_<UUIDv7-shaped>`, derived from `(seed, kind, ordinal)`.

    The first six bytes carry `ID_TIMESTAMP_MS` (a constant, not the clock) exactly as a UUIDv7
    does, the version nibble is forced to 7 and the variant bits to `10xx`; the remainder is
    BLAKE2b over the seeded label. `CORPUS_ID_PATTERN` accepts the result, and a test asserts that
    for every id in the fixture.
    """
    digest = bytearray(hashlib.blake2b(f"{seed}:{kind}:{ordinal}".encode("utf-8"), digest_size=16).digest())
    digest[0:6] = ID_TIMESTAMP_MS.to_bytes(6, "big")
    digest[6] = 0x70 | (digest[6] & 0x0F)
    digest[8] = 0x80 | (digest[8] & 0x3F)
    hexed = digest.hex()
    uuid_form = f"{hexed[0:8]}-{hexed[8:12]}-{hexed[12:16]}-{hexed[16:20]}-{hexed[20:32]}"
    minted = f"{prefix}_{uuid_form}"
    if not CORPUS_ID_PATTERN.match(minted):  # pragma: no cover — a defect in this function only
        raise AssertionError(f"minted id does not match the FND-03 opaque-id form: {minted}")
    return minted


class _Minter:
    """Seeded id factory. One counter per kind, so ids depend on the dataset, never on call timing."""

    def __init__(self, seed: int) -> None:
        self._seed = seed
        self._counters: dict[str, int] = {}

    def __call__(self, prefix: str, kind: str) -> str:
        ordinal = self._counters.get(kind, 0)
        self._counters[kind] = ordinal + 1
        return _mint(self._seed, prefix, kind, ordinal)


# ==================================================================================================
# The synthetic ABN (`SRCH-004` needs an ABN-shaped exact identifier)
# ==================================================================================================

_ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)


def abn_is_valid(digits: str) -> bool:
    """The published ABN checksum: subtract 1 from the first digit, weight, sum, mod 89."""
    if len(digits) != 11 or not digits.isdigit():
        return False
    values = [int(character) for character in digits]
    values[0] -= 1
    return sum(value * weight for value, weight in zip(values, _ABN_WEIGHTS)) % 89 == 0


def synthetic_abn(prefix: str = "530000000") -> str:
    """The first checksum-valid ABN at or above *prefix*`00`, scanned deterministically.

    Checksum-valid so downstream exact-match logic is exercised for real; invented, and registered to
    no entity — `fixtures/README.md` records that provenance.
    """
    base = int(prefix + "00")
    for candidate in range(base, base + 1000):
        digits = f"{candidate:011d}"
        if abn_is_valid(digits):
            return digits
    raise AssertionError("no checksum-valid ABN in the scanned range")  # pragma: no cover


# ==================================================================================================
# Statistics the manifest is built from
# ==================================================================================================


@dataclass(frozen=True)
class CoverageFigures:
    source_group_id: str
    coverage_status: str
    freshness_status: str
    document_count: int
    earliest_effective_from: str | None
    latest_effective_from: str | None
    last_ingestion_at: str | None


@dataclass(frozen=True)
class CorpusStats:
    """Every number the release manifest records, measured from the database that was just written.

    The manifest's figures are therefore provably what was inserted, rather than a second hand-typed
    set that can drift away from the artifact it describes.
    """

    sources: int
    documents: int
    document_versions: int
    nodes: int
    node_versions: int
    relations: int
    events: int
    chunks: int
    embeddings: int
    coverage: tuple[CoverageFigures, ...]
    quarantine_open: int
    quarantine_resolved: int
    quarantine_by_reason_code: tuple[tuple[str, int], ...]


# ==================================================================================================
# The dataset — deliverable 1's table, as an explicit literal
# ==================================================================================================

_ACT_PART = "Part 2 — Imposition of the synthetic levy\n\nThis Part imposes the levy and states who must pay it."
_ACT_DIVISION = "Division 3 — Liability of registered entities\n\nThis Division applies to entities registered under section 12."

_ACT_SECTION_2019 = (
    "14 Liability to pay the synthetic levy\n\n"
    "A registered entity is liable to pay the synthetic levy for a levy year if the entity carried "
    "on a notional enterprise at any time during that year."
)
_ACT_SECTION_2022 = (
    "14 Liability to pay the synthetic levy\n\n"
    "A registered entity is liable to pay the synthetic levy for a levy year if the entity carried "
    "on a notional enterprise at any time during that year and its notional turnover for the year "
    "exceeded the threshold amount."
)
_ACT_SECTION_2025 = (
    "14 Liability to pay the synthetic levy\n\n"
    "A registered entity is liable to pay the synthetic levy for a levy year if the entity carried "
    "on a notional enterprise at any time during that year, its notional turnover for the year "
    "exceeded the threshold amount, and the entity was not an exempt entity for the whole of that "
    "year."
)

# The non-ASCII node (offset/NFC correctness — CRPS-01 deliverable 12). Section sign, em dash and an
# accented word, all in one paragraph, so a byte-offset implementation cannot pass by accident.
_ACT_SUBSECTION_NON_ASCII = (
    "14(2) Meaning of exempt entity\n\n"
    "An entity is an exempt entity for a levy year if — and only if — the entity is a registered "
    "café operator within the meaning of § 9 of the Synthetic Levy Administration Regulations 2020."
)

_ACT_BILL_SECTION = (
    "14 Liability to pay the synthetic levy [as introduced]\n\n"
    "A registered entity is liable to pay the synthetic levy for a levy year in accordance with the "
    "regulations."
)

_REG_2020 = (
    "9 Prescribed café operators\n\n"
    "For the purposes of section 14(2) of the Act, a café operator is prescribed if it holds a "
    "notional food licence."
)
_REG_2027 = (
    "9 Prescribed café operators\n\n"
    "For the purposes of section 14(2) of the Act, a café operator is prescribed if it holds a "
    "notional food licence and is registered for the synthetic levy. The Synthetic Levy "
    "Administration Regulations 2020 are repealed."
)

_CASE_TEXT = (
    "Farrow v Commissioner of Synthetic Revenue [2026] SYNFC 7\n\n"
    "The appellant contends that section 14 of the Synthetic Levy Administration Act 2019 does not "
    "apply to a notional enterprise carried on for part of a levy year. The appeal is dismissed."
)

_GUIDANCE_TEXT = (
    "Practice Note SYN-PN 3 — Applying the synthetic levy\n\n"
    "This draft practice note explains how the Commissioner proposes to apply section 14. It has no "
    "legal effect and is published for consultation only."
)

_AWARD_TEXT = (
    "Clause 15 — Minimum weekly rates\n\n"
    "An employer must pay a full-time clerical employee at least the minimum weekly rate set out in "
    "Schedule B for the employee's classification level."
)


def _paragraphs(text: str) -> list[tuple[int, int]]:
    """Half-open CHARACTER offsets of each paragraph of *text* (blank-line separated).

    Character offsets into the NFC text are the contract's rule (`001_corpus_schema.sql`, CRPS-01
    deliverable 12), so the fixture computes them directly rather than through the CRPS-03 chunker:
    the acceptance criterion is offset/hash exactness, not chunker-profile fidelity, and CRPS-03 is
    not a blocker of this ticket.
    """
    spans: list[tuple[int, int]] = []
    cursor = 0
    for block in text.split("\n\n"):
        if block:
            spans.append((cursor, cursor + len(block)))
        cursor += len(block) + 2
    return spans


def _require_nfc(text: str) -> str:
    if unicodedata.normalize("NFC", text) != text:
        raise AssertionError("canonical_text must already be NFC-normalised")
    return text


# ==================================================================================================
# Generation
# ==================================================================================================


def generate_corpus(db_path: str | Path, *, seed: int = SEED_DEFAULT) -> CorpusStats:
    """Create and seed the fixture's `corpus.sqlite` at *db_path*, returning its statistics."""
    target = Path(db_path)
    create_corpus_database(target, release_id=RELEASE_ID)
    connection = open_corpus_database(target, read_only=False)
    try:
        # Deliverable 4 rule 4: the row `create_corpus_database()` stamped from the wall clock.
        connection.execute(
            "UPDATE corpus_meta SET built_at = ?, created_at = ?", (BASE_TIMESTAMP, BASE_TIMESTAMP)
        )
        connection.execute("BEGIN")
        try:
            _seed_rows(connection, seed)
        except BaseException:
            connection.execute("ROLLBACK")
            raise
        connection.execute("COMMIT")
        stats = _measure(connection)
        # Outside any transaction: normalises page layout and the freelist so the file's bytes
        # depend on the final content rather than on the insert history.
        connection.execute("VACUUM")
    finally:
        connection.close()
    return stats


def _seed_rows(connection: sqlite3.Connection, seed: int) -> None:
    mint = _Minter(seed)
    execute = connection.execute

    # -- authorities (2) ---------------------------------------------------------------------------
    auth_cth = mint("auth", "authority")
    auth_nsw = mint("auth", "authority")
    execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level, official_url,"
        " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (auth_cth, "Synthetic Commonwealth Parliament", "PARLIAMENT", "AU-CTH", None,
         "https://synthetic.example/cth", TS),
    )
    execute(
        "INSERT INTO authority (id, name, authority_type, jurisdiction, court_level, official_url,"
        " created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (auth_nsw, "Synthetic New South Wales Full Court", "COURT", "AU-NSW", "APPELLATE",
         "https://synthetic.example/nsw", TS),
    )

    # -- sources, licences and artifacts -----------------------------------------------------------
    # `source.licence_assessment_id` -> licence_assessment -> licence_snapshot -> source is a genuine
    # cycle (DEFERRABLE INITIALLY DEFERRED); the whole cycle goes in inside this one transaction.
    sources: list[tuple[str, str, str]] = []  # (source id, licence snapshot id, artifact id)

    def add_source(
        *,
        name: str,
        group: str,
        jurisdiction: str,
        authority_id: str,
        adapter_key: str,
        coverage_status: str,
        freshness_status: str,
        licence_status: str,
        prohibited: bool,
    ) -> tuple[str, str, str]:
        source_id = mint("src", "source")
        snapshot_id = mint("lsnap", "licence_snapshot")
        assessment_id = mint("lass", "licence_assessment")
        artifact_id = mint("art", "source_artifact")
        execute(
            "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
            " adapter_key, coverage_status, freshness_status, licence_assessment_id,"
            " last_discovery_at, last_ingestion_at, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (source_id, group, name, authority_id, jurisdiction,
             f"https://synthetic.example/{adapter_key}", adapter_key, coverage_status,
             freshness_status, assessment_id, TS, TS, TS),
        )
        execute(
            "INSERT INTO licence_snapshot (id, source_id, captured_at, terms_url, terms_sha256,"
            " artifact_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (snapshot_id, source_id, TS, f"https://synthetic.example/{adapter_key}/terms",
             sha256_hex(f"terms:{adapter_key}"), None, TS),
        )
        permitted = 0 if prohibited else 1
        execute(
            "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
            " indexing, embedding, display, quotation, export, prohibited_use, attribution_text,"
            " max_quote_chars, status, assessed_at, notes_internal, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (assessment_id, snapshot_id, permitted, permitted, permitted, permitted, permitted,
             permitted, permitted, 1 if prohibited else 0,
             None if prohibited else "Synthetic attribution notice", None if prohibited else 400,
             licence_status, TS, None, TS),
        )
        execute(
            "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
            " etag, last_modified, content_type, byte_length, sha256, r2_key, licence_snapshot_id,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (artifact_id, source_id, f"https://synthetic.example/{adapter_key}/document", TS, 200,
             None, None, "text/html", 4096, sha256_hex(f"artifact:{adapter_key}"), None,
             snapshot_id, TS),
        )
        sources.append((source_id, snapshot_id, artifact_id))
        return source_id, snapshot_id, artifact_id

    src_primary, _, art_primary = add_source(
        name="Synthetic Commonwealth legislation register",
        group=GROUP_CTH, jurisdiction="AU-CTH", authority_id=auth_cth,
        adapter_key="leg-syn-cth-primary", coverage_status="METADATA_AND_LINK_ACTIVE",
        freshness_status="CURRENT", licence_status="PERMITTED_WITH_ATTRIBUTION", prohibited=False,
    )
    src_guidance, _, art_guidance = add_source(
        name="Synthetic Commissioner guidance library",
        group=GROUP_CTH, jurisdiction="AU-CTH", authority_id=auth_cth,
        adapter_key="guid-syn-cth", coverage_status="METADATA_AND_LINK_ACTIVE",
        freshness_status="CURRENT", licence_status="PERMITTED", prohibited=False,
    )
    src_cases, _, art_case = add_source(
        name="Synthetic New South Wales judgments",
        group=GROUP_NSW, jurisdiction="AU-NSW", authority_id=auth_nsw,
        adapter_key="case-syn-nsw", coverage_status="FRESHNESS_LIMITED",
        freshness_status="STALE_KNOWN", licence_status="PERMITTED_WITH_ATTRIBUTION",
        prohibited=False,
    )
    src_awards, _, art_award = add_source(
        name="Synthetic industrial instruments register",
        group=GROUP_NSW, jurisdiction="AU-NSW", authority_id=auth_nsw,
        adapter_key="award-syn-nsw", coverage_status="LICENSING_RESTRICTED",
        freshness_status="STALE_KNOWN", licence_status="PROHIBITED", prohibited=True,
    )

    # -- the quarantined artifact: ingested, never included ----------------------------------------
    # PRD §35.3 — the fixture demonstrates the open-quarantine state WITHOUT including the item, so
    # no `document_version` references this artifact.
    run_id = mint("run", "ingestion_run")
    quarantined_artifact = mint("art", "source_artifact")
    quarantine_id = mint("qitem", "quarantine_item")
    execute(
        "INSERT INTO ingestion_run (id, source_id, mode, started_at, finished_at, status,"
        " discovered_count, fetched_count, changed_count, parsed_count, quarantined_count,"
        " tool_versions_json, failure_code, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (run_id, src_primary, "FULL", TS, TS, "SUCCEEDED", 6, 6, 6, 5, 1,
         '{"generator":"crps-08-fixture"}', None, TS),
    )
    execute(
        "INSERT INTO source_artifact (id, source_id, official_url, retrieved_at, http_status,"
        " etag, last_modified, content_type, byte_length, sha256, r2_key, licence_snapshot_id,"
        " created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (quarantined_artifact, src_primary, "https://synthetic.example/leg-syn-cth-primary/broken",
         TS, 200, None, None, "text/html", 128, sha256_hex("artifact:quarantined"), None,
         sources[0][1], TS),
    )
    execute(
        "INSERT INTO quarantine_item (id, ingestion_run_id, artifact_id, reason_code, details_json,"
        " status, resolution, resolved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (quarantine_id, run_id, quarantined_artifact, "STRUCTURE_UNPARSEABLE",
         '{"detail":"synthetic fixture: the artifact has no recognisable provision structure"}',
         "OPEN", None, None, TS),
    )

    # -- documents ---------------------------------------------------------------------------------
    doc_act = mint("doc", "legal_document")
    doc_reg = mint("doc", "legal_document")
    doc_case = mint("doc", "legal_document")
    doc_guidance = mint("doc", "legal_document")
    doc_award = mint("doc", "legal_document")
    abn = synthetic_abn()

    execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_act, src_primary, "PRIMARY_LEGISLATION", "Synthetic Levy Administration Act 2019",
         "SYN2026A00001", None, None, "SYN2026A00001", TS),
    )
    execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_reg, src_primary, "SUBORDINATE_LEGISLATION",
         "Synthetic Levy Administration Regulations 2020", "SYN2020L00007", None, None,
         "SYN2020L00007", TS),
    )
    execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_case, src_cases, "JUDICIAL_DECISION",
         "Farrow v Commissioner of Synthetic Revenue", None, "[2026] SYNFC 7", None,
         "2026-SYNFC-7", TS),
    )
    execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_guidance, src_guidance, "AGENCY_GUIDANCE",
         "Practice Note SYN-PN 3: Applying the synthetic levy", "SYN-PN-3", None, None,
         "SYN-PN-3", TS),
    )
    execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (doc_award, src_awards, "INDUSTRIAL_INSTRUMENT", "Synthetic Clerical Services Award 2026",
         "SYNMA000001", None, abn, "SYNMA000001", TS),
    )

    # -- document versions: all seven PRD §6.7 legal statuses ---------------------------------------
    def add_version(
        document_id: str, artifact_id: str, label: str, publication: str | None,
        effective_from: str | None, effective_to: str | None, status: str, url_suffix: str,
    ) -> str:
        version_id = mint("dv", "document_version")
        execute(
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
            " content_hash, official_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (version_id, document_id, artifact_id, label, publication, effective_from,
             effective_to, status, TS, sha256_hex(f"content:{document_id}:{label}"),
             f"https://synthetic.example/{url_suffix}", TS),
        )
        return version_id

    dv_act_bill = add_version(doc_act, art_primary, "bill", "2019-03-01", None, None,
                              "BILL_NOT_ENACTED", "leg-syn-cth-primary/act/bill")
    dv_act_2019 = add_version(doc_act, art_primary, "2019-07-01", DATE_2019, DATE_2019,
                              DATE_2022_EVE, "SUPERSEDED", "leg-syn-cth-primary/act/2019")
    dv_act_2022 = add_version(doc_act, art_primary, "2022-07-01", DATE_2022, DATE_2022,
                              DATE_2025_EVE, "SUPERSEDED", "leg-syn-cth-primary/act/2022")
    dv_act_2025 = add_version(doc_act, art_primary, "2025-07-01", DATE_2025, DATE_2025, None,
                              "IN_FORCE", "leg-syn-cth-primary/act/2025")
    dv_reg_2020 = add_version(doc_reg, art_primary, "2020-01-01", "2020-01-01", "2020-01-01",
                              "2026-12-31", "REPEALED", "leg-syn-cth-primary/reg/2020")
    dv_reg_2027 = add_version(doc_reg, art_primary, "2027-01-01", "2026-11-01", "2027-01-01", None,
                              "ENACTED_NOT_IN_FORCE", "leg-syn-cth-primary/reg/2027")
    dv_case = add_version(doc_case, art_case, "2026-05-12", "2026-05-12", "2026-05-12", None,
                          "STATUS_UNCONFIRMED", "case-syn-nsw/2026-synfc-7")
    dv_guidance = add_version(doc_guidance, art_guidance, "draft-1", "2026-06-01", None, None,
                              "DRAFT_OR_CONSULTATION", "guid-syn-cth/syn-pn-3")
    dv_award = add_version(doc_award, art_award, "2026-01-01", "2026-01-01", "2026-01-01", None,
                           "IN_FORCE", "award-syn-nsw/synma000001")

    # -- document nodes ----------------------------------------------------------------------------
    def add_node(document_id: str, key: str, kind: str) -> str:
        node_id = mint("node", "document_node")
        execute(
            "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (node_id, document_id, key, kind, TS),
        )
        return node_id

    node_part = add_node(doc_act, "part-2", "PART")
    node_division = add_node(doc_act, "part-2/div-3", "DIVISION")
    node_section = add_node(doc_act, "part-2/div-3/s14", "SECTION")
    node_subsection = add_node(doc_act, "part-2/div-3/s14/2", "SUBSECTION")
    node_reg = add_node(doc_reg, "r9", "SECTION")
    node_case = add_node(doc_case, "judgment", "PARAGRAPH")
    node_guidance = add_node(doc_guidance, "body", "PARAGRAPH")
    node_award = add_node(doc_award, "cl-15", "CLAUSE")

    # -- node versions: a four-level hierarchy per dated Act version --------------------------------
    def add_node_version(
        document_version_id: str, node_id: str, parent: str | None, label: str, heading: str,
        text: str, ordinal: int, effective_from: str | None, effective_to: str | None,
    ) -> str:
        canonical = _require_nfc(text)
        node_version_id = mint("nv", "node_version")
        execute(
            "INSERT INTO node_version (id, document_version_id, document_node_id,"
            " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
            " effective_from, effective_to, text_hash, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (node_version_id, document_version_id, node_id, parent, label, heading, canonical,
             ordinal, effective_from, effective_to, sha256_hex(canonical), TS),
        )
        return node_version_id

    act_sections: dict[str, str] = {}
    act_hierarchy: list[str] = []
    for version_id, section_text, effective_from, effective_to in (
        (dv_act_2019, _ACT_SECTION_2019, DATE_2019, DATE_2022_EVE),
        (dv_act_2022, _ACT_SECTION_2022, DATE_2022, DATE_2025_EVE),
        (dv_act_2025, _ACT_SECTION_2025, DATE_2025, None),
    ):
        part = add_node_version(version_id, node_part, None, "Part 2",
                                "Part 2 — Imposition of the synthetic levy", _ACT_PART, 0,
                                effective_from, effective_to)
        division = add_node_version(version_id, node_division, part, "Division 3",
                                    "Division 3 — Liability of registered entities", _ACT_DIVISION,
                                    1, effective_from, effective_to)
        section = add_node_version(version_id, node_section, division, "Section 14",
                                   "14 Liability to pay the synthetic levy", section_text, 2,
                                   effective_from, effective_to)
        subsection = add_node_version(
            version_id, node_subsection, section, "Section 14(2)", "14(2) Meaning of exempt entity",
            _ACT_SUBSECTION_NON_ASCII, 3, effective_from, effective_to,
        )
        act_sections[version_id] = section
        act_hierarchy.extend((part, division, section, subsection))

    nv_bill = add_node_version(dv_act_bill, node_section, None, "Clause 14",
                               "14 Liability to pay the synthetic levy", _ACT_BILL_SECTION, 0,
                               None, None)
    nv_reg_2020 = add_node_version(dv_reg_2020, node_reg, None, "Regulation 9",
                                   "9 Prescribed café operators", _REG_2020, 0, "2020-01-01",
                                   "2026-12-31")
    nv_reg_2027 = add_node_version(dv_reg_2027, node_reg, None, "Regulation 9",
                                   "9 Prescribed café operators", _REG_2027, 0, "2027-01-01", None)
    nv_case = add_node_version(dv_case, node_case, None, "Judgment", "Reasons for judgment",
                               _CASE_TEXT, 0, "2026-05-12", None)
    nv_guidance = add_node_version(dv_guidance, node_guidance, None, "Body", "Practice note body",
                                   _GUIDANCE_TEXT, 0, None, None)
    nv_award = add_node_version(dv_award, node_award, None, "Clause 15",
                                "Clause 15 — Minimum weekly rates", _AWARD_TEXT, 0, "2026-01-01",
                                None)

    # -- legal events (PRD §15.2: status is derived from EVIDENCED events) --------------------------
    def add_event(document_id: str, event_type: str, event_date: str, effective_date: str,
                  evidence: str, target: str) -> None:
        execute(
            "INSERT INTO legal_event (id, document_id, event_type, event_date, effective_date,"
            " evidence_node_version_id, target_version_id, metadata_json, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mint("evt", "legal_event"), document_id, event_type, event_date, effective_date,
             evidence, target, None, TS),
        )

    add_event(doc_act, "COMMENCEMENT", "2019-06-15", DATE_2019, act_sections[dv_act_2019],
              dv_act_2019)
    add_event(doc_act, "AMENDMENT", "2022-06-10", DATE_2022, act_sections[dv_act_2022], dv_act_2022)
    add_event(doc_reg, "REPEAL", "2026-11-01", "2027-01-01", nv_reg_2027, dv_reg_2020)

    # -- node relations, including one MODEL_SUGGESTED ---------------------------------------------
    def add_relation(from_id: str, to_id: str, relation_type: str, evidence: str | None,
                     start: int | None, end: int | None, derivation: str, confidence: str) -> None:
        execute(
            "INSERT INTO node_relation (id, from_node_version_id, to_node_version_id,"
            " relation_type, evidence_node_version_id, evidence_start, evidence_end, derivation,"
            " parser_version, confidence_state, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mint("nrel", "node_relation"), from_id, to_id, relation_type, evidence, start, end,
             derivation, "1.0.0", confidence, TS),
        )

    section_2025 = act_sections[dv_act_2025]
    add_relation(section_2025, nv_reg_2027, "REFERS_TO", section_2025, 0,
                 len(_ACT_SECTION_2025), "citation phrase match", "PARSER_DETERMINISTIC")
    add_relation(act_sections[dv_act_2022], act_sections[dv_act_2019], "AMENDS",
                 act_sections[dv_act_2022], 0, len(_ACT_SECTION_2022),
                 "consolidated-effect succession", "PARSER_DETERMINISTIC")
    # MODEL_SUGGESTED, and deliberately NOT evidence for any legal_event: PRD §35.2 —
    # "MODEL_SUGGESTED cannot support definitive status".
    add_relation(nv_case, section_2025, "CONSIDERS", None, None, None,
                 "model suggestion, unreviewed", "MODEL_SUGGESTED")

    # -- search chunks ------------------------------------------------------------------------------
    # The PROHIBITED-licensed document's chunks are EXCLUDED_LICENSING (PRD §11.1; CRPS-04's policy
    # outcome, written as the literal tier value rather than plumbed through `tiering.assign_tier`,
    # whose input record would have to be synthesised here at disproportionate cost).
    chunked: list[tuple[str, str, str]] = [  # (node_version id, text, tier)
        *((node_version_id, text, "TIER_1_FULL_SEMANTIC") for node_version_id, text in (
            (act_hierarchy[0], _ACT_PART), (act_hierarchy[1], _ACT_DIVISION),
            (act_hierarchy[2], _ACT_SECTION_2019), (act_hierarchy[3], _ACT_SUBSECTION_NON_ASCII),
            (act_hierarchy[4], _ACT_PART), (act_hierarchy[5], _ACT_DIVISION),
            (act_hierarchy[6], _ACT_SECTION_2022), (act_hierarchy[7], _ACT_SUBSECTION_NON_ASCII),
            (act_hierarchy[8], _ACT_PART), (act_hierarchy[9], _ACT_DIVISION),
            (act_hierarchy[10], _ACT_SECTION_2025), (act_hierarchy[11], _ACT_SUBSECTION_NON_ASCII),
            (nv_bill, _ACT_BILL_SECTION), (nv_reg_2020, _REG_2020), (nv_reg_2027, _REG_2027),
        )),
        (nv_case, _CASE_TEXT, "TIER_2_LEXICAL_AND_SELECTIVE_SEMANTIC"),
        (nv_guidance, _GUIDANCE_TEXT, "TIER_3_METADATA_AND_ON_DEMAND"),
        (nv_award, _AWARD_TEXT, "EXCLUDED_LICENSING"),
    ]
    for node_version_id, text, tier in chunked:
        for ordinal, (start, end) in enumerate(_paragraphs(text)):
            execute(
                "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
                " end_offset, text_hash, index_tier, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (mint("chk", "search_chunk"), node_version_id, ordinal, start, end,
                 sha256_hex(text[start:end]), tier, TS),
            )

    # chunk_embedding: NO ROWS. No embedding pass exists (CRPS-05 has not landed), and a
    # zero-vector table would misrepresent the bundle as embedded — deliverable 3's whole point.


def _measure(connection: sqlite3.Connection) -> CorpusStats:
    """Read the statistics back out of the database that was just written."""

    def count(table: str) -> int:
        return int(connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0])

    coverage: list[CoverageFigures] = []
    group_rows = connection.execute(
        "SELECT source_group_id, min(coverage_status), min(freshness_status), max(last_ingestion_at)"
        " FROM source GROUP BY source_group_id ORDER BY source_group_id"
    ).fetchall()
    for group_id, coverage_status, freshness_status, last_ingestion_at in group_rows:
        documents, earliest, latest = connection.execute(
            "SELECT count(DISTINCT d.id), min(v.effective_from), max(v.effective_from)"
            " FROM legal_document AS d"
            " JOIN source AS s ON s.id = d.source_id"
            " LEFT JOIN document_version AS v ON v.document_id = d.id"
            " WHERE s.source_group_id = ?",
            (group_id,),
        ).fetchone()
        coverage.append(
            CoverageFigures(
                source_group_id=str(group_id),
                coverage_status=str(coverage_status),
                freshness_status=str(freshness_status),
                document_count=int(documents),
                earliest_effective_from=earliest,
                latest_effective_from=latest,
                last_ingestion_at=last_ingestion_at,
            )
        )

    by_reason = tuple(
        (str(code), int(total))
        for code, total in connection.execute(
            "SELECT reason_code, count(*) FROM quarantine_item GROUP BY reason_code"
            " ORDER BY reason_code"
        ).fetchall()
    )
    open_count = int(
        connection.execute(
            "SELECT count(*) FROM quarantine_item WHERE status = 'OPEN'"
        ).fetchone()[0]
    )
    return CorpusStats(
        sources=count("source"),
        documents=count("legal_document"),
        document_versions=count("document_version"),
        nodes=count("document_node"),
        node_versions=count("node_version"),
        relations=count("node_relation"),
        events=count("legal_event"),
        chunks=count("search_chunk"),
        embeddings=count("chunk_embedding"),
        coverage=tuple(coverage),
        quarantine_open=open_count,
        quarantine_resolved=count("quarantine_item") - open_count,
        quarantine_by_reason_code=by_reason,
    )
