"""The versioned intermediate-record envelope (INGF-01 deliverable 8, PRD §40.7).

PRD §40.7: the adapter "emits versioned intermediate records with source URL, artifact hash and tool
version". This module is that envelope, and nothing else.

DETERMINISM IS A CONTRACT, not a nicety: `INGF-09`'s conformance DoD item 8 baselines record counts
and hashes, so two runs over the same artifact must produce byte-identical output. Therefore
`to_json()` returns TEXT (not a dict) rendered with sorted keys and fixed separators, `tool_versions`
is copied into a plain dict at construction and rendered sorted, and this module imports no clock,
no uuid and no randomness — `emitted_at` is supplied by the caller (from `Clock.now()`, which is a
port precisely so tests can fake it). A test asserts the absence of those imports.

This envelope is deliberately shaped differently from `contracts.records.Envelope` (`CRPS-01`), which
carries `contract_version`/`adapter_key`/`provenance`. Reconciling the two is a D8 + ticket writeback
for the Architect (INGF-01 plan open question Q2), not a conversion method added here.
"""

from __future__ import annotations

import enum
import json
from dataclasses import dataclass, fields
from typing import Any, Mapping

from .. import INTERMEDIATE_SCHEMA_VERSION
from .records import (
    DocumentVersionRecord,
    LegalEventRecord,
    NodeRelationRecord,
    NodeVersionRecord,
    SourceArtifactRecord,
)

__all__ = [
    "PAYLOAD_TYPES",
    "EnvelopeError",
    "IntermediateRecordEnvelope",
    "RecordType",
    "envelope_from_json",
]


class EnvelopeError(ValueError):
    """A mandatory envelope field is missing or empty (PRD §40.7; deliverable 8)."""


class RecordType(enum.StrEnum):
    """The five intermediate record types an adapter emits (PRD §40.7, §35.2, §35.3)."""

    SOURCE_ARTIFACT = "SOURCE_ARTIFACT"
    DOCUMENT_VERSION = "DOCUMENT_VERSION"
    NODE_VERSION = "NODE_VERSION"
    LEGAL_EVENT = "LEGAL_EVENT"
    NODE_RELATION = "NODE_RELATION"


#: `RecordType` -> the `CRPS-01` payload class re-exported by `.records` (D8). Used by
#: `envelope_from_json()` to rebuild a typed payload, and by any sink that needs to know the shape.
PAYLOAD_TYPES: Mapping[RecordType, type] = {
    RecordType.SOURCE_ARTIFACT: SourceArtifactRecord,
    RecordType.DOCUMENT_VERSION: DocumentVersionRecord,
    RecordType.NODE_VERSION: NodeVersionRecord,
    RecordType.LEGAL_EVENT: LegalEventRecord,
    RecordType.NODE_RELATION: NodeRelationRecord,
}


@dataclass(frozen=True, slots=True, kw_only=True)
class IntermediateRecordEnvelope:
    """One emitted intermediate record with its provenance (PRD §40.7).

    Mandatory provenance — `source_url`, `artifact_sha256` and a non-empty `tool_versions` — is
    validated at construction: a record whose origin cannot be named is not evidence.
    `tool_versions` keys are `framework`, `adapter`, `parser` and any adapter-declared extras.

    `tool_versions` is normalised to a plain `dict` copy at construction, so the envelope is NOT
    hashable. That is intentional: envelopes are compared and serialised, never used as dict keys.
    """

    schema_version: str = INTERMEDIATE_SCHEMA_VERSION
    record_type: RecordType
    group_id: str
    run_id: str
    source_url: str
    artifact_sha256: str
    tool_versions: Mapping[str, str]
    emitted_at: str
    payload: object

    def __post_init__(self) -> None:
        if not isinstance(self.source_url, str) or not self.source_url.strip():
            raise EnvelopeError("source_url is mandatory (PRD §40.7 provenance)")
        if not isinstance(self.artifact_sha256, str) or not self.artifact_sha256.strip():
            raise EnvelopeError("artifact_sha256 is mandatory (PRD §40.7 provenance)")
        if not isinstance(self.tool_versions, Mapping) or not self.tool_versions:
            raise EnvelopeError("tool_versions is mandatory and must be non-empty (PRD §40.7)")
        for key, value in self.tool_versions.items():
            if not isinstance(key, str) or not key.strip():
                raise EnvelopeError("tool_versions has a blank key")
            if not isinstance(value, str) or not value.strip():
                raise EnvelopeError(f"tool_versions[{key!r}] is blank")
        object.__setattr__(self, "record_type", RecordType(self.record_type))
        object.__setattr__(self, "tool_versions", dict(self.tool_versions))

    def to_json(self) -> str:
        """Deterministic JSON TEXT for this envelope.

        Sorted keys, fixed separators, no whitespace and no `set` iteration anywhere in the render
        path, so two runs over equal input are byte-identical (`INGF-09` DoD item 8). Returning text
        rather than a dict is what makes "byte-identical" a checkable property — note the deliberate
        difference from `contracts._Record.to_json()`, which returns a dict.
        """
        return json.dumps(
            self._as_mapping(),
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        )

    def _as_mapping(self) -> dict[str, Any]:
        payload = self.payload
        renderer = getattr(payload, "to_json", None)
        if callable(renderer):
            rendered_payload: Any = renderer()
        elif isinstance(payload, Mapping):
            rendered_payload = dict(payload)
        else:
            raise EnvelopeError(
                f"payload of type {type(payload).__name__} is neither a record with to_json() "
                "nor a mapping"
            )
        return {
            "schema_version": self.schema_version,
            "record_type": str(self.record_type),
            "group_id": self.group_id,
            "run_id": self.run_id,
            "source_url": self.source_url,
            "artifact_sha256": self.artifact_sha256,
            "tool_versions": dict(self.tool_versions),
            "emitted_at": self.emitted_at,
            "payload": rendered_payload,
        }


_ENVELOPE_FIELDS = {field.name for field in fields(IntermediateRecordEnvelope)}


def envelope_from_json(data: str | Mapping[str, Any]) -> IntermediateRecordEnvelope:
    """Rebuild an envelope from `to_json()` text (or an already-decoded mapping).

    `envelope_from_json(e.to_json()) == e` for every one of the five record types: the payload is
    rebuilt through the `CRPS-01` record class, so the round-trip is typed rather than a dict.
    """
    if isinstance(data, str):
        decoded = json.loads(data)
        if not isinstance(decoded, dict):
            raise EnvelopeError("envelope JSON must decode to an object")
        obj: Mapping[str, Any] = decoded
    elif isinstance(data, Mapping):
        obj = data
    else:
        raise EnvelopeError(f"cannot decode an envelope from {type(data).__name__}")

    unknown = set(obj) - _ENVELOPE_FIELDS
    if unknown:
        raise EnvelopeError(f"unknown envelope member(s) {sorted(unknown)}")
    missing = _ENVELOPE_FIELDS - set(obj) - {"schema_version"}
    if missing:
        raise EnvelopeError(f"missing envelope member(s) {sorted(missing)}")

    try:
        record_type = RecordType(obj["record_type"])
    except ValueError as exc:
        raise EnvelopeError(f"unknown record_type {obj['record_type']!r}") from exc

    raw_payload = obj["payload"]
    if not isinstance(raw_payload, Mapping):
        raise EnvelopeError("payload must be an object")
    payload = PAYLOAD_TYPES[record_type].from_json(raw_payload)

    return IntermediateRecordEnvelope(
        schema_version=str(obj.get("schema_version", INTERMEDIATE_SCHEMA_VERSION)),
        record_type=record_type,
        group_id=obj["group_id"],
        run_id=obj["run_id"],
        source_url=obj["source_url"],
        artifact_sha256=obj["artifact_sha256"],
        tool_versions=obj["tool_versions"],
        emitted_at=obj["emitted_at"],
        payload=payload,
    )
