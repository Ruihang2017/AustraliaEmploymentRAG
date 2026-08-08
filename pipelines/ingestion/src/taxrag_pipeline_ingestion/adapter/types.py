"""Ingestion-side value types — the ones PRD §40.7 names but `CRPS-01` does not own.

Deliverable 3 (the adapter boundary types), deliverable 5 (`AdapterMeta`) and the port value types
of deliverable 6 all live here. `ports` re-exports the port value types under their documented
names, so BOTH import paths the ticket gives work:

    from taxrag_pipeline_ingestion.adapter.types import FetchRequest
    from taxrag_pipeline_ingestion.adapter.ports import FetchRequest

They are declared here rather than in `ports` because `PriorState` (deliverable 3) carries a
`RunSummary` while `ports` needs `ArtifactRef` — declaring the data in `ports` would be a hard
import cycle.

Conventions, uniform across this package:

* every dataclass is `frozen=True, slots=True, kw_only=True` — a record is evidence and evidence
  does not mutate; keyword-only construction keeps the ticket's field order stable even where a
  later field is optional;
* every timestamp is UTC ISO-8601 **text** and every legal date is `YYYY-MM-DD` **text**
  (PRD §35.1). The only `datetime` in this package is `Clock.now()`'s return value;
* enums are `enum.StrEnum`, so a value serialises as its own text.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from typing import Literal, Mapping, Sequence

from .failures import FailureCode
from .records import DocumentVersionRecord, NodeVersionRecord

__all__ = [
    "AdapterMeta",
    "AdapterMetaError",
    "ArtifactRef",
    "DiscoveryCursor",
    "DiscoveryFinding",
    "FetchRequest",
    "FetchResult",
    "FetchValidators",
    "IntendedUse",
    "LicenceDecision",
    "NormalisedDocument",
    "ParseOutcome",
    "ParsedBlock",
    "ParsedDocument",
    "ParserLimits",
    "PriorState",
    "RemoteDescriptor",
    "RunMode",
    "RunSummary",
    "StableDocumentIdentity",
    "ValidationFinding",
    "ValidationFindings",
]


class AdapterMetaError(ValueError):
    """`AdapterMeta` violates the `adapter_key == group_id.lower()` invariant (deliverable 5)."""


# ------------------------------------------------------------------------------------------------
# Discovery (PRD §40.7 `discover`)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class RemoteDescriptor:
    """One discovered remote item, before any fetch (PRD §40.7 `discover`, §35.1 date forms).

    `descriptor_key` is the adapter's stable per-item key used for incremental comparison across
    runs — it must be derived from the source's own identity, never from a URL that may be rewritten.

    Distinct from `contracts.records.RemoteDescriptor` (`CRPS-01`), which is a persisted INR payload
    with a different shape. The two must never be imported into one namespace; the upstream one is
    reachable only as an explicit `contracts.records` import.
    """

    url: str
    descriptor_key: str
    kind: str
    discovered_at: str
    etag: str | None
    last_modified: str | None
    declared_content_type: str | None
    declared_bytes: int | None
    hints: Mapping[str, str]


@dataclass(frozen=True, slots=True, kw_only=True)
class DiscoveryCursor:
    """Resume point for a paged or incremental discovery walk (PRD §40.7 `discover`)."""

    value: str
    page: int | None = None


@dataclass(frozen=True, slots=True, kw_only=True)
class DiscoveryFinding:
    """The per-descriptor outcome of comparing discovery against prior state (PRD §40.7, §12.1).

    Only `status` is fixed by INGF-01 deliverable 3; `descriptor` and `detail` are carried because
    `INGF-05`'s run stage derives the status per descriptor and has to report which one. A change to
    this shape is a writeback to INGF-01 deliverable 3 (planned open question Q6).
    """

    descriptor: RemoteDescriptor
    status: Literal["NEW", "CHANGED", "UNCHANGED", "REMOVED", "UNAVAILABLE"]
    detail: str | None = None


# ------------------------------------------------------------------------------------------------
# Fetch (PRD §40.7 `fetch`, §37.4 shared fetcher)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchValidators:
    """The `validators` argument of PRD §40.7's `fetch` — conditional-request and size limits."""

    etag: str | None
    last_modified: str | None
    expected_content_types: Sequence[str]
    max_bytes: int | None


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchRequest:
    """One request handed to the shared `Fetcher` port (PRD §37.4: never a raw HTTP library)."""

    url: str
    group_id: str
    validators: FetchValidators
    method: Literal["GET", "HEAD"] = "GET"


@dataclass(frozen=True, slots=True, kw_only=True)
class FetchResult:
    """The shared fetcher's result (PRD §37.4, §35.3).

    Field names are fixed here so `INGF-02` — which implements `Fetcher` and owns the behaviour —
    never has to write into this file. Behaviour that `INGF-02` deliverable 4 names (a `close()`,
    a structured timings type) is deliberately NOT declared here: adding it would duplicate that
    ticket's deliverable. `timings` is a plain mapping of phase name -> seconds.

    `official_url` is the URL the adapter asked for; `final_url` is where the redirect chain ended.
    Both are recorded because provenance cites the official URL (PRD §35.3) while integrity checks
    need the actual one.
    """

    status_code: int
    official_url: str
    final_url: str
    headers: Mapping[str, str]
    body_path: str | None
    byte_length: int
    sha256: str
    retrieved_at: str
    redirect_chain: Sequence[str]
    not_modified: bool
    timings: Mapping[str, float]


@dataclass(frozen=True, slots=True, kw_only=True)
class ArtifactRef:
    """A stored (or deliberately unstored) source artifact (PRD §35.3).

    `storage_key` is `None` when storage is not permitted — PRD §35.3: "object key absent when
    storage is not permitted". A `None` here is a licence outcome, not a failure.
    """

    artifact_id: str
    sha256: str
    byte_length: int
    content_type: str
    official_url: str
    final_url: str
    retrieved_at: str
    storage_key: str | None


# ------------------------------------------------------------------------------------------------
# Identity, parsing, normalisation (PRD §40.7 `identify` / `parse` / `normalise`)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class StableDocumentIdentity:
    """The identity a document keeps across versions — mirrors PRD §35.2 `legal_document`."""

    stable_source_key: str
    document_type: str
    official_identifier: str | None
    neutral_citation: str | None
    canonical_title: str
    employer_abn: str | None


@dataclass(frozen=True, slots=True, kw_only=True)
class ParsedBlock:
    """One structural block of a parsed document (PRD §15.3, §40.8 item 5).

    `start_offset`/`end_offset` are CHARACTER offsets into `ParsedDocument.text` and must satisfy
    the exact-text round-trip: `text[start_offset:end_offset]` reproduces this block verbatim. The
    invariant is the adapter's obligation and is checked by `INGF-09`'s conformance kit; it is
    deliberately NOT enforced in this constructor, which would make every adapter's unit tests
    depend on a framework-side interpretation of "verbatim".
    """

    path: str
    label: str | None
    heading: str | None
    start_offset: int
    end_offset: int
    ordinal: int
    kind: str


@dataclass(frozen=True, slots=True, kw_only=True)
class ParsedDocument:
    """The output of PRD §40.7's `parse` — text plus its structural blocks (PRD §15.3).

    `text` is the single source of the exact text; blocks index into it (see `ParsedBlock`), so the
    document is never stored twice and a block can always be quoted with its exact source offsets.
    """

    parser_key: str
    parser_version: str
    text: str
    blocks: Sequence[ParsedBlock]
    media_type: str
    page_count: int | None
    ocr_confidence: float | None
    warnings: Sequence[str]


@dataclass(frozen=True, slots=True, kw_only=True)
class NormalisedDocument:
    """The `DocumentVersion + NodeVersions` return of PRD §40.7's `normalise`.

    Both payload types are `CRPS-01`'s, re-exported by `.records` — never redefined here (A4/D8).
    """

    document_version: DocumentVersionRecord
    node_versions: Sequence[NodeVersionRecord]


# ------------------------------------------------------------------------------------------------
# Runs (PRD §12.1) — declared here because `PriorState` carries a `RunSummary`
# ------------------------------------------------------------------------------------------------


class RunMode(enum.StrEnum):
    """How a run is executed (PRD §40.9 stage runner, implemented by `INGF-05`)."""

    FULL = "FULL"
    INCREMENTAL = "INCREMENTAL"
    DISCOVERY_ONLY = "DISCOVERY_ONLY"
    REPLAY = "REPLAY"


@dataclass(frozen=True, slots=True, kw_only=True)
class RunSummary:
    """The recorded outcome of one ingestion run (PRD §12.1; recorded by `INGF-05`).

    The four `*_at` fields are the PRD §12.1 freshness dates, named identically here, in `INGF-05`
    deliverable 2 and in `INGF-07` deliverable 5 so the three tickets agree without editing each
    other's files. The fifth PRD §12.1 item, `freshness_status`, is DERIVED by `INGF-07` from these
    dates and the source's declared cadence, and is deliberately not a recorded field.
    """

    run_id: str
    group_id: str
    mode: RunMode
    status: str
    started_at: str
    finished_at: str | None
    last_discovery_check_at: str | None
    last_successful_change_scan_at: str | None
    last_full_reconciliation_at: str | None
    last_content_ingestion_at: str | None
    counts: Mapping[str, int]


@dataclass(frozen=True, slots=True, kw_only=True)
class PriorState:
    """What the previous run left behind, handed to PRD §40.7's `validate` as `priorState`."""

    document_version: DocumentVersionRecord | None
    node_versions: Sequence[NodeVersionRecord]
    last_run: RunSummary | None


# ------------------------------------------------------------------------------------------------
# Validation (PRD §40.7 `validate`)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class ValidationFinding:
    """One finding produced by PRD §40.7's `validate` (PRD §12.2 code + operator action).

    `code` is a registered `FailureCode` (see `.failures`). Distinct from
    `contracts.records.ValidationFinding` (`CRPS-01`), which is a persisted INR payload with a
    different shape; the two are never imported into one namespace.
    """

    code: FailureCode
    severity: Literal["BLOCK", "FLAG", "INFO"]
    message: str
    details: Mapping[str, object]


@dataclass(frozen=True, slots=True, kw_only=True)
class ValidationFindings:
    """The `ValidationFindings` return of PRD §40.7's `validate`."""

    findings: Sequence[ValidationFinding]

    @property
    def has_blocking(self) -> bool:
        """True when any finding is `BLOCK` — the candidate must not be promoted."""
        return any(finding.severity == "BLOCK" for finding in self.findings)


# ------------------------------------------------------------------------------------------------
# Licensing and parsing ports' value types (deliverable 6)
# ------------------------------------------------------------------------------------------------


class IntendedUse(enum.StrEnum):
    """What a caller wants to do with an artifact; the `LicenceGate` decides per use (PRD §37.4)."""

    STORE_ARTIFACT = "STORE_ARTIFACT"
    INDEX_LEXICAL = "INDEX_LEXICAL"
    EMBED = "EMBED"
    DISPLAY_TEXT = "DISPLAY_TEXT"
    QUOTE = "QUOTE"
    EXPORT = "EXPORT"


@dataclass(frozen=True, slots=True, kw_only=True)
class LicenceDecision:
    """One licence decision for one `IntendedUse` (implemented by `INGF-04`).

    `reason` is a registered `FailureCode` when `allowed` is False, so a refusal is always
    explainable to an operator (ADM-001).
    """

    allowed: bool
    reason: FailureCode | None
    max_quote_chars: int | None
    attribution_text: str | None
    index_eligibility: str | None


@dataclass(frozen=True, slots=True, kw_only=True)
class ParserLimits:
    """Resource ceilings for one sandboxed parser invocation (PRD §37.4; `INGF-06` implements).

    Every field is required and no default is declared here on purpose: the default VALUES are
    `INGF-06` deliverable 2, and duplicating them would create two sources of truth for a security
    boundary.
    """

    cpu_seconds: int
    wall_seconds: int
    address_space_bytes: int
    max_output_chars: int
    max_pages: int
    max_archive_members: int
    max_uncompressed_bytes: int
    max_compression_ratio: int


@dataclass(frozen=True, slots=True, kw_only=True)
class ParseOutcome:
    """The result of `ParserHost.run` — a document, or a `FailureCode` explaining its absence."""

    document: ParsedDocument | None = None
    code: FailureCode | None = None
    message: str | None = None

    @property
    def ok(self) -> bool:
        """True only when a document was produced and no failure code was raised."""
        return self.document is not None and self.code is None


# ------------------------------------------------------------------------------------------------
# Adapter metadata (deliverable 5)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True, kw_only=True)
class AdapterMeta:
    """Static identity of one source adapter (PRD §40.2–40.6 Group IDs, PRD §40.8).

    `group_id` is the UPPERCASE Group ID from PRD §40.2–40.6; `adapter_key` is the lowercase
    directory name under `pipelines/adapters/` (sub-PRD D5). The invariant
    `adapter_key == group_id.lower()` is what makes the directory convention a lookup rather than a
    manifest, so it is enforced at construction.
    """

    group_id: str
    adapter_key: str
    jurisdiction: str
    authority_id: str
    adapter_version: str
    supported_content_types: Sequence[str]
    declared_quarantine_reasons: Sequence[FailureCode]

    def __post_init__(self) -> None:
        if self.adapter_key != self.group_id.lower():
            raise AdapterMetaError(
                f"adapter_key {self.adapter_key!r} must equal group_id.lower() "
                f"({self.group_id.lower()!r}) — sub-PRD D5 directory convention"
            )
