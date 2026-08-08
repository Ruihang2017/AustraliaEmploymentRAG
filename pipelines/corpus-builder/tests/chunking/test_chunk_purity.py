"""The Reviewer-focus items of the CRPS-03 test plan, made mechanical.

Confirms against the source that the chunker performs no I/O, holds no module-level mutable state and
no cache, works in CHARACTER offsets everywhere, and never writes an index tier.

The checks run over CODE TOKENS ONLY — comments and string literals are filtered out with
`tokenize` — so the module docstrings stay free to *explain* what is forbidden and why (they name
`index_tier`, `lru_cache` and `src/tiering` on purpose) without the guard tripping over its own
documentation. A ban that forbids talking about the rule is a ban people delete.
"""

from __future__ import annotations

import ast
import io
import tokenize
from pathlib import Path

import pytest
from conftest import SRC

CHUNKING = SRC / "chunking"
SOURCES = sorted(CHUNKING.glob("*.py"))

#: Names that would make the chunker impure, stateful, byte-oriented or coupled to CRPS-04.
FORBIDDEN_NAMES = {
    # I/O of any kind.
    "open", "Path", "sqlite3", "socket", "urllib", "requests", "httpx", "subprocess", "shutil",
    "os", "sys", "tempfile", "pickle", "input",
    # Non-determinism.
    "random", "datetime", "time", "uuid", "locale", "getenv", "environ",
    # Caches and shared mutable state — the parallel-build determinism and memory hazard.
    "lru_cache", "cache", "cached_property", "globals", "nonlocal",
    # Byte orientation: offsets are CHARACTER offsets end to end (CRPS-01 deliverable 12). The one
    # legitimate encode lives in `contracts.validate.sha256_hex`, which this module calls.
    "encode", "decode", "bytes", "bytearray", "memoryview",
}

ALLOWED_IMPORT_ROOTS = {
    "__future__", "dataclasses", "json", "re", "typing", "unicodedata",  # standard library
    "contracts",  # CRPS-01, read-only reuse
}


def source_of(path: Path) -> str:
    with open(path, "rb") as handle:
        return handle.read().decode("utf-8")


def code_tokens(path: Path) -> list[tokenize.TokenInfo]:
    """Every token except comments, strings and layout — i.e. the code, without the prose."""
    stream = io.StringIO(source_of(path))
    return [
        token
        for token in tokenize.generate_tokens(stream.readline)
        if token.type
        not in {
            tokenize.COMMENT,
            tokenize.STRING,
            tokenize.NL,
            tokenize.NEWLINE,
            tokenize.INDENT,
            tokenize.DEDENT,
            tokenize.ENDMARKER,
            tokenize.ENCODING,
        }
    ]


def test_the_module_has_the_files_the_ticket_names() -> None:
    assert {path.name for path in SOURCES} == {
        "__init__.py",
        "chunker.py",
        "models.py",
        "profile.py",
        "segment.py",
        "validate.py",
    }
    assert (CHUNKING / "README.md").is_file()
    assert (CHUNKING / ".gitattributes").is_file()


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.name)
def test_no_forbidden_name_appears_in_code(path: Path) -> None:
    used = {token.string for token in code_tokens(path) if token.type == tokenize.NAME}
    assert not (used & FORBIDDEN_NAMES), f"{path.name}: {sorted(used & FORBIDDEN_NAMES)}"


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.name)
def test_no_index_tier_anywhere_in_code(path: Path) -> None:
    """CRPS-04 owns tier assignment; the boundary must not erode into an import or a member."""
    offenders = [
        token.string
        for token in code_tokens(path)
        if token.type == tokenize.NAME and "tier" in token.string.lower()
    ]
    assert offenders == [], f"{path.name}: {offenders}"
    tree = ast.parse(source_of(path))
    for statement in ast.walk(tree):
        if isinstance(statement, ast.ImportFrom):
            assert (statement.module or "").split(".")[0] != "tiering", path.name
        if isinstance(statement, ast.Import):
            for alias in statement.names:
                assert alias.name.split(".")[0] != "tiering", path.name


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.name)
def test_imports_are_standard_library_or_contracts_only(path: Path) -> None:
    tree = ast.parse(source_of(path))
    for statement in ast.walk(tree):
        if isinstance(statement, ast.Import):
            for alias in statement.names:
                root = alias.name.split(".")[0]
                assert root in ALLOWED_IMPORT_ROOTS, f"{path.name}: import {alias.name}"
        elif isinstance(statement, ast.ImportFrom):
            if statement.level:  # a relative import inside this module
                continue
            root = (statement.module or "").split(".")[0]
            assert root in ALLOWED_IMPORT_ROOTS, f"{path.name}: from {statement.module}"


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.name)
def test_no_module_level_mutable_state(path: Path) -> None:
    """Module level holds constants only: no list, dict or set that a call could mutate."""
    allowed_calls = {"frozenset", "compile", "ChunkProfile"}
    tree = ast.parse(source_of(path))
    for statement in tree.body:
        if isinstance(statement, (ast.Assign, ast.AnnAssign)):
            targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
            names = [target.id for target in targets if isinstance(target, ast.Name)]
            if names == ["__all__"]:
                continue
            value = statement.value
            if value is None or isinstance(value, ast.Constant):
                continue
            assert isinstance(value, ast.Call), f"{path.name}: {names} is not a constant"
            called = value.func
            label = called.attr if isinstance(called, ast.Attribute) else getattr(called, "id", "")
            assert label in allowed_calls, f"{path.name}: {names} = {label}(...)"


@pytest.mark.parametrize("path", SOURCES, ids=lambda path: path.name)
def test_no_global_statement_and_no_decorated_cache(path: Path) -> None:
    tree = ast.parse(source_of(path))
    for statement in ast.walk(tree):
        assert not isinstance(statement, ast.Global), path.name
        if isinstance(statement, ast.FunctionDef):
            for decorator in statement.decorator_list:
                label = (
                    decorator.attr
                    if isinstance(decorator, ast.Attribute)
                    else getattr(decorator, "id", "")
                )
                assert "cache" not in label.lower(), f"{path.name}: @{label}"


def test_every_frozen_dataclass_is_frozen_and_slotted() -> None:
    """A record is evidence and evidence does not mutate (the CRPS-01 convention)."""
    from chunking import ChunkProfile, ChunkViolation, NodeVersionInput, SearchChunkDraft

    for kind in (ChunkProfile, ChunkViolation, NodeVersionInput, SearchChunkDraft):
        assert kind.__dataclass_params__.frozen, kind.__name__
        assert getattr(kind, "__slots__", None) is not None, kind.__name__
