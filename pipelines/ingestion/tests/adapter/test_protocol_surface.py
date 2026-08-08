"""`SourceAdapter` declares exactly the eight PRD §40.7 boundaries (deliverable 4)."""

from __future__ import annotations

import inspect
import re

import pytest
from taxrag_pipeline_ingestion.adapter import SourceAdapter
from taxrag_pipeline_ingestion.adapter import protocol as protocol_module

EIGHT_BOUNDARIES = {
    "discover",
    "fetch",
    "identify",
    "parse",
    "normalise",
    "extract_events",
    "extract_relations",
    "validate",
}

PRD_NAMES = {
    "discover",
    "fetch",
    "identify",
    "parse",
    "normalise",
    "extractEvents",
    "extractRelations",
    "validate",
}


def _public_methods(cls: type) -> set[str]:
    return {
        name
        for name, value in vars(cls).items()
        if not name.startswith("_") and callable(value)
    }


def _docstring_table_rows() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for line in (protocol_module.__doc__ or "").splitlines():
        line = line.strip()
        if not line.startswith("|") or not line.endswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != 2 or set(cells[0]) <= set("- "):
            continue
        rows.append((cells[0], cells[1]))
    return [row for row in rows if row[0] != "PRD §40.7"]


def test_public_surface_is_exactly_the_eight_boundaries() -> None:
    assert _public_methods(SourceAdapter) == EIGHT_BOUNDARIES


def test_docstring_table_maps_all_eight_prd_names_to_the_python_names() -> None:
    rows = _docstring_table_rows()
    assert len(rows) == 8, rows
    prd_named = {re.findall(r"`([A-Za-z]+)\(", prd)[0] for prd, _ in rows}
    python_named = {re.findall(r"`([a-z_]+)\(", python)[0] for _, python in rows}
    assert prd_named == PRD_NAMES
    assert python_named == EIGHT_BOUNDARIES


def _protocol_params(name: str) -> list[str]:
    """The declared parameter names of one protocol boundary, `self` included."""
    return list(inspect.signature(getattr(SourceAdapter, name)).parameters)


def _stub_source(omit: str | None = None, wrong_arity: str | None = None) -> type:
    """A generated adapter class whose methods mirror the protocol's own parameter lists."""
    namespace: dict[str, object] = {"meta": None}
    for name in sorted(EIGHT_BOUNDARIES):
        if name == omit:
            continue
        params = _protocol_params(name)
        if name == wrong_arity:
            params = params[:-1]  # one parameter short: the arity control
        exec(f"def {name}({', '.join(params)}): return None", namespace)  # noqa: S102 — control
    namespace.pop("__builtins__", None)
    return type("Stub", (), namespace)


def test_a_conforming_stub_satisfies_the_protocol() -> None:
    assert isinstance(_stub_source()(), SourceAdapter)


def test_a_stub_without_meta_fails() -> None:
    stub_type = _stub_source()
    delattr(stub_type, "meta")
    assert not isinstance(stub_type(), SourceAdapter)


@pytest.mark.parametrize("missing", sorted(EIGHT_BOUNDARIES))
def test_a_stub_missing_one_boundary_fails(missing: str) -> None:
    assert not isinstance(_stub_source(omit=missing)(), SourceAdapter)


@pytest.mark.parametrize("boundary", sorted(EIGHT_BOUNDARIES))
def test_a_stub_with_the_wrong_arity_is_rejected_by_signature_comparison(boundary: str) -> None:
    """`runtime_checkable` cannot see arity, so the arity control is an explicit signature check.

    This is exactly the gap `INGF-09`'s conformance kit closes for real adapters; `load_adapter()`
    deliberately does not try to close it.
    """
    stub = _stub_source(wrong_arity=boundary)()
    assert isinstance(stub, SourceAdapter)  # presence-only: the protocol still passes

    expected = len(inspect.signature(getattr(SourceAdapter, boundary)).parameters)
    actual = len(inspect.signature(getattr(stub, boundary)).parameters) + 1  # bound: `self` dropped
    assert actual != expected

    for other in sorted(EIGHT_BOUNDARIES - {boundary}):
        conforming = _stub_source()()
        assert (
            len(inspect.signature(getattr(conforming, other)).parameters) + 1
            == len(inspect.signature(getattr(SourceAdapter, other)).parameters)
        )
