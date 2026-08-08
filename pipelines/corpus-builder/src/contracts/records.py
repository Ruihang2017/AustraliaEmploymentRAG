"""Frozen Python models for the intermediate normalised-record contract (CRPS-01 deliverable 15).

Stdlib dataclasses, deliberately: the JSON Schemas beside them are the language-neutral contract, so
these classes are a typed convenience for Python callers and must not become a second, divergent
source of truth. `validate_record()` validates the JSON, never these objects.

Every class is `frozen=True, slots=True` — a record is evidence, and evidence does not mutate
(PRD §35.8 invariant 5, applied one layer earlier than the database).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from typing import Any, Mapping, Self

__all__ = [
    "RECORD_TYPES",
    "DocumentIdentity",
    "DocumentNode",
    "DocumentVersion",
    "Envelope",
    "LegalEvent",
    "NodeRef",
    "NodeRelation",
    "NodeVersion",
    "Provenance",
    "RemoteDescriptor",
    "SourceArtifact",
    "ToolVersions",
    "ValidationFinding",
    "VersionRef",
]


def _drop_none(value: Any) -> Any:
    """Recursively drop `None` members.

    An optional member is ABSENT in this contract, never `null`: every payload schema is
    `additionalProperties: false` with no `"null"` in any type, so a `null` would fail validation.
    """
    if isinstance(value, dict):
        return {key: _drop_none(item) for key, item in value.items() if item is not None}
    if isinstance(value, list):
        return [_drop_none(item) for item in value]
    return value


@dataclass(frozen=True, slots=True)
class _Record:
    def to_json(self) -> dict[str, Any]:
        """A plain JSON-ready dict with absent optionals removed."""
        return _drop_none(asdict(self))

    @classmethod
    def from_json(cls, obj: Mapping[str, Any]) -> Self:
        """Build from a validated mapping. Unknown members are a hard error, not a silent drop."""
        known = {field.name for field in fields(cls)}
        unknown = set(obj) - known
        if unknown:
            raise ValueError(f"{cls.__name__}: unknown member(s) {sorted(unknown)}")
        return cls(**{key: obj[key] for key in obj})


# ------------------------------------------------------------------------------------------------
# References (deliverable 11) — natural keys only, never a corpus primary key.
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class NodeRef(_Record):
    stable_source_key: str
    version_label: str
    stable_node_key: str


@dataclass(frozen=True, slots=True)
class VersionRef(_Record):
    stable_source_key: str
    version_label: str


# ------------------------------------------------------------------------------------------------
# Envelope members
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ToolVersions(_Record):
    adapter: str
    framework: str
    parser: str
    ocr: str | None = None


@dataclass(frozen=True, slots=True)
class Provenance(_Record):
    official_url: str
    artifact_sha256: str
    retrieved_at: str


# ------------------------------------------------------------------------------------------------
# Payloads (deliverable 10)
# ------------------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RemoteDescriptor(_Record):
    descriptor_key: str
    official_url: str
    discovered_at: str
    etag: str | None = None
    last_modified: str | None = None
    content_type: str | None = None
    document_hint: str | None = None
    cursor: str | None = None


@dataclass(frozen=True, slots=True)
class SourceArtifact(_Record):
    artifact_key: str
    official_url: str
    retrieved_at: str
    http_status: int
    content_type: str
    byte_length: int
    sha256: str
    licence_snapshot_key: str
    etag: str | None = None
    last_modified: str | None = None
    r2_key: str | None = None


@dataclass(frozen=True, slots=True)
class DocumentIdentity(_Record):
    stable_source_key: str
    document_type: str
    canonical_title: str
    jurisdiction: str
    authority_key: str
    official_identifier: str | None = None
    neutral_citation: str | None = None
    employer_abn: str | None = None


@dataclass(frozen=True, slots=True)
class DocumentVersion(_Record):
    stable_source_key: str
    version_label: str
    effective_from: str
    legal_status: str
    retrieved_at: str
    content_hash: str
    official_url: str
    artifact_key: str
    publication_date: str | None = None
    effective_to: str | None = None


@dataclass(frozen=True, slots=True)
class DocumentNode(_Record):
    stable_source_key: str
    stable_node_key: str
    node_kind: str


@dataclass(frozen=True, slots=True)
class NodeVersion(_Record):
    stable_source_key: str
    version_label: str
    stable_node_key: str
    canonical_text: str
    ordinal: int
    effective_from: str
    text_hash: str
    parent_stable_node_key: str | None = None
    display_label: str | None = None
    heading: str | None = None
    effective_to: str | None = None


@dataclass(frozen=True, slots=True)
class LegalEvent(_Record):
    stable_source_key: str
    event_type: str
    event_date: str
    effective_date: str | None = None
    evidence_ref: dict[str, str] | None = None
    target_version_label: str | None = None
    metadata_json: str | None = None


@dataclass(frozen=True, slots=True)
class NodeRelation(_Record):
    from_ref: dict[str, str]
    to_ref: dict[str, str]
    relation_type: str
    derivation: str
    parser_version: str
    confidence_state: str
    evidence_ref: dict[str, str] | None = None
    evidence_start: int | None = None
    evidence_end: int | None = None


@dataclass(frozen=True, slots=True)
class ValidationFinding(_Record):
    finding_code: str
    severity: str
    subject_ref: dict[str, str] | None = None
    details_json: str | None = None


#: `record_type` -> (payload class, schema filename in `schema/intermediate/v1/`).
#: The envelope schema's `record_type` enum and this mapping must list the same nine names; a test
#: asserts it, so a tenth type cannot be added on one side only.
RECORD_TYPES: dict[str, tuple[type[_Record], str]] = {
    "remote_descriptor": (RemoteDescriptor, "remote-descriptor.schema.json"),
    "source_artifact": (SourceArtifact, "source-artifact.schema.json"),
    "document_identity": (DocumentIdentity, "document-identity.schema.json"),
    "document_version": (DocumentVersion, "document-version.schema.json"),
    "document_node": (DocumentNode, "document-node.schema.json"),
    "node_version": (NodeVersion, "node-version.schema.json"),
    "legal_event": (LegalEvent, "legal-event.schema.json"),
    "node_relation": (NodeRelation, "node-relation.schema.json"),
    "validation_finding": (ValidationFinding, "validation-finding.schema.json"),
}


@dataclass(frozen=True, slots=True)
class Envelope(_Record):
    """One emitted record. `payload` stays a plain mapping — the JSON is the contract."""

    contract_version: str
    record_type: str
    adapter_key: str
    source_id: str
    ingestion_run_id: str
    emitted_at: str
    tool_versions: dict[str, str]
    provenance: dict[str, str]
    payload: dict[str, Any]

    def payload_object(self) -> _Record:
        """Build the typed payload for this envelope's `record_type`."""
        if self.record_type not in RECORD_TYPES:
            raise ValueError(f"unknown record_type {self.record_type!r}")
        return RECORD_TYPES[self.record_type][0].from_json(self.payload)
