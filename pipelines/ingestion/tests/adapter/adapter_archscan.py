"""AST architecture scanner for INGF-01 deliverable 11.

It lives in the test tree, not in `src/`: INGF-01's test plan says `INGF-02`/`INGF-06` COPY the
construction pattern, and keeping the scanner out of the shipped surface keeps the package's public
API exactly the set of names the ticket fixes. The module name is prefixed so it cannot clash with
another ticket's test-local helper under pytest's prepend import mode.

Three rules, each with its PRD basis:

1. no module under an adapter tree touches the corpus database — PRD §40.7 "The adapter never writes
   active corpus tables directly";
2. no module under an adapter tree imports an HTTP library — PRD §37.4 "Adapters use a shared
   fetcher, not arbitrary HTTP libraries";
3. no module under `pipelines/ingestion/**` or an adapter tree imports `packages/**` or a
   tenant/customer module — PRD §39.1 "Python pipeline code never imports tenant/customer packages".

WHY RULE 3 IS IMPORT-ONLY. Rules 1 and 2 also scan string constants (a hardcoded `corpus.sqlite`
path is the same violation as the import), but rule 3 does not: this repository's own tests and
scanners legitimately carry the words `tenant` and `customer` as DATA, and a guard that forbids
naming the rule is a guard people delete (the CRPS-03 lesson). Rules 1 and 2 are only ever run over
adapter trees — never over this scanner or the tests that exercise it — so the same trap does not
apply to them.

Only absolute imports are examined (`ast.ImportFrom` with `level == 0`); a relative import cannot
reach any of these roots.
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

__all__ = [
    "DENIED_DB_ROOTS",
    "DENIED_HTTP_ROOTS",
    "Violation",
    "scan_paths",
    "scan_tree",
]

#: Rule 1 — corpus-database access.
DENIED_DB_ROOTS: frozenset[str] = frozenset({"sqlite3", "better_sqlite3"})
DENIED_DB_MODULE_PREFIXES: tuple[str, ...] = ("contracts.schema",)
DENIED_DB_NAMES_FROM_CONTRACTS: frozenset[str] = frozenset(
    {"create_corpus_database", "open_corpus_database", "render_corpus_ddl", "schema_fingerprint"}
)
DENIED_DB_STRINGS: tuple[str, ...] = ("app.sqlite", "corpus.sqlite")

#: Rule 2 — direct HTTP. `http` covers `http.client`; `urllib` covers `urllib.request`.
DENIED_HTTP_ROOTS: frozenset[str] = frozenset(
    {"requests", "httpx", "aiohttp", "urllib", "urllib3", "http", "socket"}
)

#: Rule 3 — tenant/customer/app packages.
DENIED_PACKAGE_ROOTS: frozenset[str] = frozenset({"packages"})
DENIED_TENANT_MODULE = re.compile(r"(^|\.)(tenant|tenants|customer|customers)(\.|$)")


@dataclass(frozen=True, slots=True)
class Violation:
    """One rule breach: which file, which line, which rule, and what was found."""

    path: Path
    line: int
    rule: str
    detail: str


def _imported_modules(tree: ast.AST) -> Iterable[tuple[str, int]]:
    """Every absolutely-imported dotted module name in *tree*, with its line number."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name, node.lineno
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                yield node.module, node.lineno


def _string_constants(tree: ast.AST) -> Iterable[tuple[str, int]]:
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            yield node.value, node.lineno


def _scan_file(path: Path, *, adapter_tree: bool) -> list[Violation]:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    found: list[Violation] = []

    for module, line in _imported_modules(tree):
        root = module.split(".")[0]
        if adapter_tree:
            if root in DENIED_DB_ROOTS or module.startswith(DENIED_DB_MODULE_PREFIXES):
                found.append(Violation(path, line, "corpus-database", f"imports {module}"))
            if root in DENIED_HTTP_ROOTS:
                found.append(Violation(path, line, "direct-http", f"imports {module}"))
        if root in DENIED_PACKAGE_ROOTS or DENIED_TENANT_MODULE.search(module):
            found.append(Violation(path, line, "tenant-package", f"imports {module}"))

    if adapter_tree:
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module == "contracts":
                for alias in node.names:
                    if alias.name in DENIED_DB_NAMES_FROM_CONTRACTS:
                        found.append(
                            Violation(
                                path,
                                node.lineno,
                                "corpus-database",
                                f"imports contracts.{alias.name}",
                            )
                        )
        for value, line in _string_constants(tree):
            for needle in DENIED_DB_STRINGS:
                if needle in value:
                    found.append(
                        Violation(path, line, "corpus-database", f"names {needle} in a string")
                    )

    return found


def scan_paths(paths: Sequence[Path], *, adapter_tree: bool) -> list[Violation]:
    """Scan the given `.py` files. `adapter_tree=False` applies rule 3 only."""
    violations: list[Violation] = []
    for path in paths:
        violations.extend(_scan_file(path, adapter_tree=adapter_tree))
    return violations


def python_files(root: Path, *, exclude: Sequence[Path] = ()) -> list[Path]:
    """Every `.py` file under *root*, sorted, minus anything under *exclude*.

    Tolerating an absent root is required: `pipelines/adapters/` gains content only in module `06`.
    *exclude* exists for exactly one caller — scanning the whole of `pipelines/ingestion/**` must
    skip this suite's deliberately dirty fixture groups, which are negative controls, not code.
    """
    root = Path(root)
    if not root.is_dir():
        return []
    excluded = [Path(item).resolve() for item in exclude]
    files: list[Path] = []
    for path in sorted(root.rglob("*.py")):
        resolved = path.resolve()
        if any(resolved.is_relative_to(item) for item in excluded):
            continue
        files.append(path)
    return files


def scan_tree(root: Path, *, adapter_tree: bool, exclude: Sequence[Path] = ()) -> list[Violation]:
    """Scan every `.py` file under *root*."""
    return scan_paths(python_files(root, exclude=exclude), adapter_tree=adapter_tree)
