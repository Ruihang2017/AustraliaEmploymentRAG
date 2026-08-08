"""The import root and the two framework versions (INGF-01 deliverable 1, sub-PRD D11/M4)."""

from __future__ import annotations

from pathlib import Path

import taxrag_pipeline_ingestion
from conftest import REPO_ROOT, SRC


def test_the_package_resolves_under_the_src_layout_not_the_skeleton() -> None:
    """Guard against the two same-named packages silently swapping over.

    `FND-01`'s byte-empty skeleton at the member root has the same importable name as this ticket's
    src-layout package. Nothing puts the member root on `sys.path` today, so the src copy always
    wins; this test turns a future regression into a named failure instead of a mystery.
    """
    resolved = Path(taxrag_pipeline_ingestion.__file__).resolve()
    assert resolved.is_relative_to(SRC.resolve()), resolved


def test_framework_versions() -> None:
    assert taxrag_pipeline_ingestion.FRAMEWORK_VERSION == "0.1.0"
    assert taxrag_pipeline_ingestion.INTERMEDIATE_SCHEMA_VERSION == "1"


def test_the_fnd01_skeleton_entry_file_is_still_byte_empty() -> None:
    """`assertEntryFilesEmpty()` under `pnpm test` requires it; asserted here too so a Python-only
    run cannot quietly break the workspace assertions."""
    skeleton = REPO_ROOT / "pipelines" / "ingestion" / "taxrag_pipeline_ingestion" / "__init__.py"
    assert skeleton.is_file()
    assert skeleton.stat().st_size == 0


def test_src_and_test_dirs_carry_no_package_marker() -> None:
    """A second direct-child package directory would fail `assertSkeleton()` for the whole repo."""
    member = REPO_ROOT / "pipelines" / "ingestion"
    for candidate in (member / "src", member / "tests", member / "tests" / "adapter"):
        assert not (candidate / "__init__.py").exists(), candidate
