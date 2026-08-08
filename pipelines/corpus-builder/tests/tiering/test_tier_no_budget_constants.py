"""No capacity figure may live in `src/tiering/**` — CRPS-04 acceptance item 11.

Breakdown plan §8 Q3 (the always-hot vector count, the semantic-cache limits, the resident
allocation) is DEFERRED until real-scale measurement and belongs to `RLSE-11`. If one of those
figures could enter this module it would arrive as a tier downgrade — "silently deleting agreed
legal scope", which PRD §2 forbids. This scan makes that mechanically impossible to add unnoticed.

The scan reads CODE ONLY: identifiers and numeric literals from the AST, never comments and never
string contents. The module docstrings must stay free to *explain* that no budget exists here — a
ban that forbids stating the rule is a ban people delete.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest
from conftest import TIERING_SRC

BUDGET_WORDS = re.compile(
    r"budget|quota|hot_vector|max_vectors|memory|cache_size|byte_limit|gigabyte|mebibyte|ram_",
    re.IGNORECASE,
)
"""The shapes a Q3 figure would take if it leaked in."""

MAX_LITERAL = 1000
"""The policy needs no large number: the tier ranks are 0-3 and the counters step by one. A
150_000 / 300_000 hot-vector hypothesis, or a byte limit, cannot hide under this ceiling."""

SOURCE_FILES = sorted(TIERING_SRC.rglob("*.py"))


def test_the_scan_sees_the_whole_package() -> None:
    assert SOURCE_FILES, f"no Python sources found under {TIERING_SRC}"


def _identifiers(tree: ast.AST) -> set[str]:
    """Every identifier the code declares or reads. Strings and comments are NOT identifiers."""
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names.add(node.id)
        elif isinstance(node, ast.Attribute):
            names.add(node.attr)
        elif isinstance(node, ast.arg):
            names.add(node.arg)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.keyword) and node.arg:
            names.add(node.arg)
        elif isinstance(node, ast.alias):
            names.add((node.asname or node.name).split(".")[-1])
    return names


@pytest.mark.parametrize("path", SOURCE_FILES, ids=lambda path: path.name)
def test_no_budget_shaped_identifier(path: Path) -> None:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    offenders = sorted(name for name in _identifiers(tree) if BUDGET_WORDS.search(name))
    assert not offenders, (
        f"{path.name} declares budget-shaped identifier(s) {offenders}. Breakdown plan §8 Q3 is "
        f"deferred and belongs to RLSE-11; no capacity figure may influence a tier (PRD §2)."
    )


@pytest.mark.parametrize("path", SOURCE_FILES, ids=lambda path: path.name)
def test_no_large_numeric_literal(path: Path) -> None:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    offenders = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant)
        and isinstance(node.value, (int, float))
        and not isinstance(node.value, bool)
        and abs(node.value) > MAX_LITERAL
    ]
    assert not offenders, (
        f"{path.name} contains the numeric literal(s) {offenders}, above the {MAX_LITERAL} "
        f"ceiling. The tier policy needs no capacity number."
    )


@pytest.mark.parametrize("path", SOURCE_FILES, ids=lambda path: path.name)
def test_no_deferred_question_id_as_a_value(path: Path) -> None:
    """`Q3` may be discussed in prose; it may not be a value the code carries."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    literals = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]
    assert "Q3" not in literals
    assert "Q5" not in literals


@pytest.mark.parametrize("path", SOURCE_FILES, ids=lambda path: path.name)
def test_no_module_level_mutable_state_and_no_cache(path: Path) -> None:
    """A module-level cache would be a shared-state hazard for a parallel CRPS-06 build."""
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, filename=str(path))
    decorators = {
        ast.unparse(decorator)
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        for decorator in node.decorator_list
    }
    for decorator in decorators:
        assert "cache" not in decorator.lower(), f"{path.name} caches via @{decorator}"

    for node in tree.body:
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            value = node.value
            if value is None:
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(t, ast.Name) and t.id == "__all__" for t in targets):
                continue  # the export list is read by the import machinery, never by the policy
            rendered = ast.unparse(value)
            assert not isinstance(value, (ast.List, ast.Set)), (
                f"{path.name} declares a mutable module-level {type(value).__name__}: {rendered}"
            )
            if isinstance(value, ast.Dict):
                raise AssertionError(
                    f"{path.name} declares a bare module-level dict: {rendered}. Wrap it in "
                    f"MappingProxyType so it cannot be mutated at runtime."
                )
