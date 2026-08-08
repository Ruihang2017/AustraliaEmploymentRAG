"""The `CRPS-01` record types are re-exported by identity, never copied (deliverable 2, A4/D8)."""

from __future__ import annotations

import contracts.records as upstream
import pytest
from taxrag_pipeline_ingestion.adapter import records

PAIRS = [
    ("SourceArtifactRecord", "SourceArtifact"),
    ("DocumentVersionRecord", "DocumentVersion"),
    ("NodeVersionRecord", "NodeVersion"),
    ("LegalEventRecord", "LegalEvent"),
    ("NodeRelationRecord", "NodeRelation"),
]


@pytest.mark.parametrize(("local", "upstream_name"), PAIRS)
def test_the_re_export_is_an_alias(local: str, upstream_name: str) -> None:
    assert getattr(records, local) is getattr(upstream, upstream_name)


def test_the_module_exports_exactly_the_five_records() -> None:
    assert set(records.__all__) == {local for local, _ in PAIRS}


def test_the_package_re_export_is_the_same_object() -> None:
    from taxrag_pipeline_ingestion import adapter

    assert adapter.DocumentVersionRecord is upstream.DocumentVersion


def test_the_ingestion_side_types_are_not_the_upstream_ones() -> None:
    """`RemoteDescriptor` and `ValidationFinding` exist on both sides with different shapes."""
    from taxrag_pipeline_ingestion import adapter

    assert adapter.RemoteDescriptor is not upstream.RemoteDescriptor
    assert adapter.ValidationFinding is not upstream.ValidationFinding
