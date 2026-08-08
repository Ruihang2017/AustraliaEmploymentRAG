"""Architecture scans over the adapter trees (deliverable 11; PRD §37.4, §40.7, §39.1, SEC-002)."""

from __future__ import annotations

from pathlib import Path

import pytest
from adapter_archscan import python_files, scan_paths, scan_tree
from conftest import ADAPTER_FIXTURES, ADAPTERS_TREE, REPO_ROOT

CLEAN_GROUPS = ("demo-ok", "_shared", "demo-no-ADAPTER", "demo-bad-protocol")
DIRTY = {
    "demo-dirty-sqlite": "corpus-database",
    "demo-dirty-http": "direct-http",
    "demo-dirty-packages": "tenant-package",
}


def _group(name: str) -> list[Path]:
    return python_files(ADAPTER_FIXTURES / name)


@pytest.mark.parametrize(("group", "rule"), sorted(DIRTY.items()))
def test_a_dirty_fixture_is_reported(group: str, rule: str) -> None:
    violations = scan_paths(_group(group), adapter_tree=True)
    assert violations, group
    assert {item.rule for item in violations} >= {rule}


@pytest.mark.parametrize("group", CLEAN_GROUPS)
def test_a_clean_fixture_passes(group: str) -> None:
    assert scan_paths(_group(group), adapter_tree=True) == []


def test_the_scan_is_not_vacuous() -> None:
    """A scan that parsed nothing would pass every rule silently."""
    assert len(_group("demo-ok")) >= 1
    assert len(python_files(ADAPTER_FIXTURES)) >= 7


def test_the_real_adapter_tree_is_clean_and_an_absent_one_is_tolerated() -> None:
    """`pipelines/adapters/` is created by module `06`; today it holds only an empty package."""
    assert scan_tree(ADAPTERS_TREE, adapter_tree=True) == []


def test_no_ingestion_module_imports_a_tenant_or_packages_module() -> None:
    """PRD §39.1. The deliberately dirty fixtures are negative controls, not code, so they are
    excluded — every other file under the member is scanned."""
    member = REPO_ROOT / "pipelines" / "ingestion"
    violations = scan_tree(
        member,
        adapter_tree=False,
        exclude=[ADAPTER_FIXTURES],
    )
    assert violations == []
    assert len(python_files(member, exclude=[ADAPTER_FIXTURES])) >= 10


def test_the_tenant_rule_reports_the_fixture_even_outside_an_adapter_tree() -> None:
    """Rule 3 binds `pipelines/ingestion/**` as well as `pipelines/adapters/**`."""
    violations = scan_paths(_group("demo-dirty-packages"), adapter_tree=False)
    assert [item.rule for item in violations] == ["tenant-package"]
