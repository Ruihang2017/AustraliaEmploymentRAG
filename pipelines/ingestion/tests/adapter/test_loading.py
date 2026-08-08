"""Adapter location by directory convention (deliverable 9, sub-PRD D5)."""

from __future__ import annotations

from pathlib import Path

import pytest
from conftest import ADAPTER_FIXTURES
from taxrag_pipeline_ingestion.adapter import (
    AdapterLoadError,
    SourceAdapter,
    iter_adapter_dirs,
    load_adapter,
)

EXPECTED_GROUPS = {
    "demo-bad-protocol",
    "demo-dirty-http",
    "demo-dirty-packages",
    "demo-dirty-sqlite",
    "demo-no-ADAPTER",
    "demo-ok",
}


def test_iter_adapter_dirs_skips_underscore_and_adapterless_directories() -> None:
    found = {path.name for path in iter_adapter_dirs(ADAPTER_FIXTURES)}
    assert found == EXPECTED_GROUPS
    assert "_shared" not in found  # skipped by the `_` prefix, not by being unloadable
    assert "demo-no-adapter-py" not in found


def test_iter_adapter_dirs_is_sorted() -> None:
    names = [path.name for path in iter_adapter_dirs(ADAPTER_FIXTURES)]
    assert names == sorted(names)


def test_the_underscore_fixture_is_itself_loadable() -> None:
    """Proves the skip rule is the prefix and nothing else."""
    assert isinstance(load_adapter(ADAPTER_FIXTURES / "_shared"), SourceAdapter)


def test_an_absent_root_yields_nothing(tmp_path: Path) -> None:
    assert list(iter_adapter_dirs(tmp_path / "does-not-exist")) == []


def test_load_adapter_returns_the_module_level_adapter() -> None:
    adapter = load_adapter(ADAPTER_FIXTURES / "demo-ok")
    assert isinstance(adapter, SourceAdapter)
    assert adapter.meta.group_id == "DEMO_OK"


def test_load_adapter_is_idempotent() -> None:
    first = load_adapter(ADAPTER_FIXTURES / "demo-ok")
    second = load_adapter(ADAPTER_FIXTURES / "demo-ok")
    assert first is second


@pytest.mark.parametrize(
    ("group", "needle"),
    [
        ("demo-no-adapter-py", "no adapter.py"),
        ("demo-no-ADAPTER", "no module-level ADAPTER"),
        ("demo-bad-protocol", "does not satisfy the SourceAdapter protocol"),
    ],
)
def test_load_adapter_failures_are_wrapped(group: str, needle: str) -> None:
    with pytest.raises(AdapterLoadError) as excinfo:
        load_adapter(ADAPTER_FIXTURES / group)
    assert needle in str(excinfo.value)
    assert group in str(excinfo.value)


def test_an_import_error_is_wrapped_and_leaves_no_half_module(tmp_path: Path) -> None:
    group = tmp_path / "demo-explodes"
    group.mkdir()
    (group / "adapter.py").write_text("raise RuntimeError('boom')\n", encoding="utf-8")
    with pytest.raises(AdapterLoadError) as excinfo:
        load_adapter(group)
    assert "failed to import" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, RuntimeError)

    import sys

    assert "taxrag_ingestion_adapter_demo_explodes" not in sys.modules


def test_two_groups_get_distinct_module_names(tmp_path: Path) -> None:
    """52 groups each ship an `adapter.py`; a shared module name would overwrite them all."""
    import sys

    for name, marker in (("group-a", "A"), ("group-b", "B")):
        group = tmp_path / name
        group.mkdir()
        (group / "adapter.py").write_text(f"MARKER = {marker!r}\nADAPTER = None\n", encoding="utf-8")
        with pytest.raises(AdapterLoadError):
            load_adapter(group)  # ADAPTER = None is not a SourceAdapter
    assert sys.modules["taxrag_ingestion_adapter_group_a"].MARKER == "A"
    assert sys.modules["taxrag_ingestion_adapter_group_b"].MARKER == "B"
