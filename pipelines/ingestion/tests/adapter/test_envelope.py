"""The versioned intermediate-record envelope (deliverable 8, PRD §40.7)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from taxrag_pipeline_ingestion import INTERMEDIATE_SCHEMA_VERSION
from taxrag_pipeline_ingestion.adapter import (
    DocumentVersionRecord,
    EnvelopeError,
    IntermediateRecordEnvelope,
    LegalEventRecord,
    NodeRelationRecord,
    NodeVersionRecord,
    RecordType,
    SourceArtifactRecord,
    envelope_from_json,
)
from taxrag_pipeline_ingestion.adapter import envelope as envelope_module

PAYLOADS = {
    RecordType.SOURCE_ARTIFACT: SourceArtifactRecord(
        artifact_key="ak_1",
        official_url="https://example.gov.au/a.html",
        retrieved_at="2026-01-01T00:00:00Z",
        http_status=200,
        content_type="text/html",
        byte_length=12,
        sha256="a" * 64,
        licence_snapshot_key="ls_1",
    ),
    RecordType.DOCUMENT_VERSION: DocumentVersionRecord(
        stable_source_key="au-cth-demo",
        version_label="2026-01-01",
        effective_from="2026-01-01",
        legal_status="in_force",
        retrieved_at="2026-01-01T00:00:00Z",
        content_hash="b" * 64,
        official_url="https://example.gov.au/a.html",
        artifact_key="ak_1",
    ),
    RecordType.NODE_VERSION: NodeVersionRecord(
        stable_source_key="au-cth-demo",
        version_label="2026-01-01",
        stable_node_key="s-1",
        canonical_text="Text.",
        ordinal=0,
        effective_from="2026-01-01",
        text_hash="c" * 64,
    ),
    RecordType.LEGAL_EVENT: LegalEventRecord(
        stable_source_key="au-cth-demo",
        event_type="commencement",
        event_date="2026-01-01",
    ),
    RecordType.NODE_RELATION: NodeRelationRecord(
        from_ref={"stable_source_key": "au-cth-demo", "version_label": "2026-01-01", "stable_node_key": "s-1"},
        to_ref={"stable_source_key": "au-cth-demo", "version_label": "2026-01-01", "stable_node_key": "s-2"},
        relation_type="cites",
        derivation="parser",
        parser_version="0.0.1",
        confidence_state="confirmed",
    ),
}


def make(
    *,
    record_type: RecordType = RecordType.DOCUMENT_VERSION,
    source_url: str = "https://example.gov.au/a.html",
    artifact_sha256: str = "b" * 64,
    tool_versions: dict[str, str] | None = None,
) -> IntermediateRecordEnvelope:
    return IntermediateRecordEnvelope(
        record_type=record_type,
        group_id="AU_CTH_DEMO",
        run_id="run_1",
        source_url=source_url,
        artifact_sha256=artifact_sha256,
        tool_versions=tool_versions if tool_versions is not None else {"framework": "0.1.0", "adapter": "0.0.1", "parser": "p1"},
        emitted_at="2026-01-01T00:00:00Z",
        payload=PAYLOADS[record_type],
    )


def test_schema_version_defaults_to_the_framework_constant() -> None:
    assert make().schema_version == INTERMEDIATE_SCHEMA_VERSION == "1"


def test_to_json_is_byte_identical_for_equal_input_in_different_key_order() -> None:
    first = make(tool_versions={"adapter": "0.0.1", "framework": "0.1.0", "parser": "p1"})
    second = make(tool_versions={"parser": "p1", "framework": "0.1.0", "adapter": "0.0.1"})
    assert first.to_json() == second.to_json()
    assert first.to_json().encode("utf-8") == second.to_json().encode("utf-8")
    assert first.to_json() == first.to_json()


@pytest.mark.parametrize(
    "kwargs",
    [
        {"source_url": ""},
        {"source_url": "   "},
        {"artifact_sha256": ""},
        {"tool_versions": {}},
        {"tool_versions": {"framework": ""}},
        {"tool_versions": {"": "0.1.0"}},
    ],
)
def test_mandatory_provenance_is_enforced(kwargs: dict[str, object]) -> None:
    with pytest.raises(EnvelopeError):
        make(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize("record_type", list(RecordType))
def test_round_trip_for_every_record_type(record_type: RecordType) -> None:
    original = make(record_type=record_type)
    assert envelope_from_json(original.to_json()) == original
    assert envelope_from_json(original.to_json()).to_json() == original.to_json()


def test_round_trip_rebuilds_a_typed_payload() -> None:
    original = make(record_type=RecordType.NODE_VERSION)
    rebuilt = envelope_from_json(original.to_json())
    assert isinstance(rebuilt.payload, NodeVersionRecord)


def test_unknown_and_missing_members_are_rejected() -> None:
    obj = envelope_from_json(make().to_json())
    with pytest.raises(EnvelopeError):
        envelope_from_json({**obj._as_mapping(), "extra": 1})
    incomplete = obj._as_mapping()
    del incomplete["run_id"]
    with pytest.raises(EnvelopeError):
        envelope_from_json(incomplete)


def test_the_envelope_module_imports_no_clock_uuid_or_randomness() -> None:
    """Determinism is structural, not a convention: `emitted_at` comes from the caller's `Clock`."""
    tree = ast.parse(Path(envelope_module.__file__).read_text(encoding="utf-8"))
    imported: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            imported.add(node.module.split(".")[0])
    assert imported.isdisjoint({"datetime", "time", "uuid", "random", "secrets"}), imported
