"""The ingestion-side value types (deliverables 3 and 5)."""

from __future__ import annotations

import dataclasses

import pytest
from taxrag_pipeline_ingestion.adapter import (
    AdapterMeta,
    AdapterMetaError,
    FailureCode,
    ParseOutcome,
    ParsedBlock,
    ParsedDocument,
    ValidationFinding,
    ValidationFindings,
)


def _meta(**overrides: object) -> AdapterMeta:
    kwargs: dict[str, object] = {
        "group_id": "AU_CTH_DEMO",
        "adapter_key": "au_cth_demo",
        "jurisdiction": "AU_CTH",
        "authority_id": "DEMO",
        "adapter_version": "0.0.1",
        "supported_content_types": ("text/html",),
        "declared_quarantine_reasons": (),
    }
    kwargs.update(overrides)
    return AdapterMeta(**kwargs)  # type: ignore[arg-type]


def test_adapter_meta_accepts_the_matching_pair() -> None:
    assert _meta().adapter_key == "au_cth_demo"


@pytest.mark.parametrize("adapter_key", ["AU_CTH_DEMO", "au-cth-demo", "au_cth_dem", ""])
def test_adapter_meta_rejects_a_mismatched_key(adapter_key: str) -> None:
    with pytest.raises(AdapterMetaError) as excinfo:
        _meta(adapter_key=adapter_key)
    assert "adapter_key" in str(excinfo.value)


def test_adapter_meta_is_frozen() -> None:
    with pytest.raises(dataclasses.FrozenInstanceError):
        _meta().group_id = "OTHER"  # type: ignore[misc]


def test_has_blocking() -> None:
    def finding(severity: str) -> ValidationFinding:
        return ValidationFinding(
            code=FailureCode("SOME_CODE"),
            severity=severity,  # type: ignore[arg-type]
            message="m",
            details={},
        )

    assert not ValidationFindings(findings=()).has_blocking
    assert not ValidationFindings(findings=(finding("FLAG"), finding("INFO"))).has_blocking
    assert ValidationFindings(findings=(finding("INFO"), finding("BLOCK"))).has_blocking


def test_parse_outcome_ok() -> None:
    document = ParsedDocument(
        parser_key="demo",
        parser_version="0.0.1",
        text="Hello.",
        blocks=(
            ParsedBlock(
                path="/1",
                label=None,
                heading=None,
                start_offset=0,
                end_offset=6,
                ordinal=0,
                kind="paragraph",
            ),
        ),
        media_type="text/html",
        page_count=None,
        ocr_confidence=None,
        warnings=(),
    )
    assert ParseOutcome(document=document).ok
    assert not ParseOutcome(code=FailureCode("PARSE_TIMEOUT"), message="slow").ok
    assert not ParseOutcome().ok
    # The offset round-trip the adapters owe (PRD §40.8 item 5) — documented, not enforced here.
    block = document.blocks[0]
    assert document.text[block.start_offset : block.end_offset] == "Hello."
