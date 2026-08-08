"""The concurrent-ticket import boundary — CRPS-04 acceptance item 9 / deliverable 4.

`src/tiering/**` must not import `chunking` (CRPS-03) or `manifest` (CRPS-02). The ticket writes
those names as `src.chunking` / `src.manifest`; under the live CRPS-01 import convention
(`pipelines/corpus-builder/src` is the module root) the importable names are `chunking` / `manifest`.
BOTH spellings are asserted, so the criterion is met literally and meaningfully.

Two independent halves:

1. a STATIC AST scan of the source, which is the durable one — it holds whether or not a sibling's
   directory happens to exist in this worktree, and it simultaneously enforces stdlib-only imports
   and therefore the no-I/O guarantee;
2. a FRESH-INTERPRETER check that imports `tiering` and inspects `sys.modules`, which is the
   ticket's test-plan step 3. Its failure message reports whether `chunking` is resolvable at all,
   so a green run is visibly non-vacuous.
"""

from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import TIERING_SRC

STDLIB_ALLOWLIST = frozenset(
    {"__future__", "collections", "dataclasses", "enum", "types", "typing"}
)
"""The complete set of top-level modules `src/tiering/**` may import. Everything that could perform
I/O — `os`, `pathlib`, `sqlite3`, `json`, `subprocess`, `socket`, `logging`, `time`, `random`,
`functools` (hence `lru_cache`) — is outside it."""

FORBIDDEN = ("chunking", "manifest", "src", "src.chunking", "src.manifest", "contracts")

SOURCE_FILES = sorted(TIERING_SRC.rglob("*.py"))


def test_the_scan_sees_the_whole_package() -> None:
    """A scan over zero files would pass vacuously."""
    assert SOURCE_FILES, f"no Python sources found under {TIERING_SRC}"
    names = {path.name for path in SOURCE_FILES}
    assert {"__init__.py", "errors.py", "inputs.py", "policy.py", "reasons.py", "report.py",
            "tiers.py"} <= names


def _imported_roots(path: Path) -> set[str]:
    """Every absolute top-level module name imported by *path* (relative imports are internal)."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                continue  # `from .tiers import ...` — internal to this package.
            if node.module:
                roots.add(node.module.split(".")[0])
    return roots


@pytest.mark.parametrize("path", SOURCE_FILES, ids=lambda path: path.name)
def test_imports_are_stdlib_only(path: Path) -> None:
    roots = _imported_roots(path)
    unexpected = roots - STDLIB_ALLOWLIST
    assert not unexpected, (
        f"{path.name} imports {sorted(unexpected)}, outside the tiering allowlist "
        f"{sorted(STDLIB_ALLOWLIST)}. The module must stay pure (no I/O, no cache) and must not "
        f"import a sibling ticket's package."
    )


@pytest.mark.parametrize("forbidden", FORBIDDEN)
def test_no_source_file_imports_a_sibling_package(forbidden: str) -> None:
    """Both the ticket's spelling (`src.chunking`) and the live one (`chunking`)."""
    root = forbidden.split(".")[0]
    for path in SOURCE_FILES:
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text, filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    assert alias.name != forbidden and alias.name.split(".")[0] != root, (
                        f"{path.name} imports {alias.name}"
                    )
            elif isinstance(node, ast.ImportFrom) and not node.level and node.module:
                assert node.module != forbidden and node.module.split(".")[0] != root, (
                    f"{path.name} imports from {node.module}"
                )


_FRESH_INTERPRETER_PROBE = """
import importlib.util
import json
import sys

import tiering  # noqa: F401

banned = {"chunking", "manifest", "src"}
leaked = sorted({name for name in sys.modules if name.split(".")[0] in banned})
resolvable = sorted(name for name in banned if importlib.util.find_spec(name) is not None)
print(json.dumps({"leaked": leaked, "resolvable": resolvable}))
"""


def test_a_fresh_interpreter_importing_tiering_pulls_in_no_sibling() -> None:
    """Test-plan step 3: `src.chunking` / `src.manifest` absent from `sys.modules`."""
    import json

    completed = subprocess.run(
        [sys.executable, "-c", _FRESH_INTERPRETER_PROBE],
        capture_output=True,
        text=True,
        cwd=str(TIERING_SRC.parent),
        env={**_clean_env(), "PYTHONPATH": str(TIERING_SRC.parent)},
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    result = json.loads(completed.stdout.strip().splitlines()[-1])
    assert result["leaked"] == [], (
        f"importing `tiering` pulled in {result['leaked']}. "
        f"(Resolvable sibling packages in this checkout: {result['resolvable']} — an empty list "
        f"there would mean this check is vacuous.)"
    )


def _clean_env() -> dict[str, str]:
    """The current environment minus anything that would pre-seed `sys.path`."""
    import os

    env = {key: value for key, value in os.environ.items() if key != "PYTHONPATH"}
    return env
