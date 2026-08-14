"""Static source scans over `src/embeddings/**` (acceptance items 5, 9, 13; Reviewer focus).

These are AST scans, not runtime checks, and that is the point: they stay non-vacuous even where a
dependency is absent or a code path is never reached in a test. Three of the ticket's acceptance
items are phrased as "a source scan asserts …" for exactly that reason.

Modelled on `pipelines/corpus-builder/tests/manifest/test_no_environment_inference.py`.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[1] / "src" / "embeddings"
TESTS = Path(__file__).resolve().parent

MODULES = sorted(SRC.glob("*.py"))


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _imported_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.add(node.module.split(".")[0])
    return names


def _string_literals(tree: ast.Module) -> list[str]:
    """Every string constant that is NOT a docstring."""
    docstrings = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            body = getattr(node, "body", None)
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                if isinstance(body[0].value.value, str):
                    docstrings.add(id(body[0].value))
    return [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings
    ]


def test_the_scan_sees_the_modules_it_claims_to() -> None:
    """A scan over an empty file list passes everything. Guard against that first."""
    assert len(MODULES) >= 12
    assert {path.name for path in MODULES} >= {
        "build.py",
        "cli.py",
        "emit.py",
        "guard.py",
        "persist.py",
        "profile.py",
        "provider.py",
        "selection.py",
        "vectors.py",
    }


# ==================================================================================================
# 1. The import allowlist — the third-party surface is one module wide
# ==================================================================================================

BACKEND_PACKAGES = {"usearch", "numpy"}


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_only_vectors_may_import_the_vector_backend(path: Path) -> None:
    imported = _imported_names(_tree(path)) & BACKEND_PACKAGES
    if path.name == "vectors.py":
        return
    assert imported == set(), f"{path.name} imports {sorted(imported)}; only vectors.py may"


def _touches_sys_path(tree: ast.Module) -> bool:
    """True when the module really accesses `sys.path` — prose in a docstring does not count."""
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Attribute)
            and node.attr == "path"
            and isinstance(node.value, ast.Name)
            and node.value.id == "sys"
        ):
            return True
    return False


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_only_bootstrap_may_touch_sys_path(path: Path) -> None:
    """Confining the cross-member `sys.path` insertion is what keeps it reversible."""
    touches = _touches_sys_path(_tree(path))
    if path.name == "_bootstrap.py":
        assert touches, "_bootstrap.py is supposed to be the module that does this"
        return
    assert not touches, f"{path.name} manipulates sys.path; only _bootstrap.py may"


FORBIDDEN_IMPORTS = {
    "socket",
    "urllib",
    "http",
    "requests",
    "huggingface_hub",
    "transformers",
    "torch",
    "onnxruntime",
    "ssl",
    "ftplib",
}


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_module_imports_a_network_or_model_runtime_client(path: Path) -> None:
    """PRD §19.3, §20.3 and breakdown plan §8 Q11: offline, and no model-hub client anywhere."""
    offending = _imported_names(_tree(path)) & FORBIDDEN_IMPORTS
    assert offending == set(), f"{path.name} imports {sorted(offending)}"


def test_no_module_imports_the_rust_search_service() -> None:
    """Breakdown plan R6: importing services/search-rs from here would be a module cycle."""
    for path in MODULES:
        source = path.read_text(encoding="utf-8")
        assert "search_rs" not in source and "search-rs" not in source.replace(
            "`services/search-rs`", ""
        ).replace("services/search-rs", "")


# ==================================================================================================
# 2. No pin is inferred from the environment, an installed package or a lockfile (item 5)
# ==================================================================================================

#: `(object, attribute)` pairs that would read a pin out of the running environment.
FORBIDDEN_ATTRIBUTES = (
    ("os", "environ"),
    ("os", "getenv"),
    ("environ", "get"),
    ("metadata", "version"),
    ("importlib", "metadata"),
)
FORBIDDEN_LITERALS = ("Cargo.lock", "Cargo.toml", "uv.lock", "pyproject.toml", "requirements.txt")


def _attribute_accesses(tree: ast.Module) -> set[tuple[str, str]]:
    """Real `obj.attr` accesses. Prose in a docstring is not one, which is why this is AST-based."""
    found: set[tuple[str, str]] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
            found.add((node.value.id, node.attr))
    return found


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_environment_or_lockfile_inference(path: Path) -> None:
    """The whole value of Q11 is that RETR-07 verifies against a RECORDED value.

    Any `os.environ`, `importlib.metadata` or lockfile read would defeat that silently — the
    manifest would look identical while describing whatever happened to be installed.
    """
    tree = _tree(path)

    imported = _imported_names(tree)
    assert "pkg_resources" not in imported

    offending = _attribute_accesses(tree) & set(FORBIDDEN_ATTRIBUTES)
    assert offending == set(), f"{path.name} reads {sorted(offending)}"

    # A literal that IS one of these filenames (or a path ending in one) is a file this module
    # would be about to open. Prose that merely mentions the name inside a longer error message —
    # which several of them do, to explain the FND-01 dependency gap — is not.
    #
    # `_bootstrap.py` is the one exception, and only for `pyproject.toml`: it uses that name as a
    # REPOSITORY-ROOT MARKER (`(candidate / "pyproject.toml").is_file()`), the walk CRPS-01 and
    # CRPS-02 both use so the package works inside a `/start-all` worktree. It never opens it —
    # asserted separately below. `uv.lock` and the Cargo manifests have no such excuse anywhere.
    forbidden_here = tuple(
        name
        for name in FORBIDDEN_LITERALS
        if not (path.name == "_bootstrap.py" and name == "pyproject.toml")
    )
    for literal in _string_literals(tree):
        candidate = literal.strip().replace("\\", "/")
        assert candidate not in forbidden_here, f"{path.name} names {candidate} as a path"
        for forbidden in forbidden_here:
            assert not candidate.endswith(f"/{forbidden}"), (
                f"{path.name} builds a path to {forbidden}"
            )


def test_the_root_marker_is_only_ever_existence_checked() -> None:
    """`_bootstrap.py` may name `pyproject.toml`, but must never read a byte of it.

    The distinction matters: locating the repository root is infrastructure, whereas reading that
    file would be inferring a pin from a manifest, which breakdown plan §8 Q11 forbids outright.
    """
    tree = _tree(SRC / "_bootstrap.py")
    reads = {"read_text", "read_bytes", "open", "load", "loads", "parse"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            assert node.func.attr not in reads, f"_bootstrap.py calls {node.func.attr}"


def test_the_forbidden_attribute_scan_is_not_vacuous() -> None:
    """A positive control: the scan must reject a module that really does read the environment.

    And it must NOT reject one that only mentions the name in prose — otherwise every module that
    documents why it does not read the environment would fail, and the honest fix would be to stop
    documenting it.
    """
    reads_it = ast.parse("import os\nvalue = os.environ.get('SOME_SETTING')\n")
    assert _attribute_accesses(reads_it) & set(FORBIDDEN_ATTRIBUTES)

    only_mentions_it = ast.parse('"""This module never reads os.environ."""\nx = 1\n')
    assert not (_attribute_accesses(only_mentions_it) & set(FORBIDDEN_ATTRIBUTES))


def test_the_forbidden_literal_scan_is_not_vacuous() -> None:
    sample = ast.parse('PATH = "uv.lock"\n')
    assert [literal for literal in _string_literals(sample) if literal in FORBIDDEN_LITERALS]


# ==================================================================================================
# 3. No hub-id resolution (item 13)
# ==================================================================================================

FORBIDDEN_CALLS = ("from_pretrained", "hf_hub_download", "snapshot_download", "AutoModel", "AutoTokenizer")


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_model_hub_resolution(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    for call in FORBIDDEN_CALLS:
        assert call not in source, f"{path.name} resolves a model by hub id via {call}"


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_url_literal_outside_a_docstring(path: Path) -> None:
    for literal in _string_literals(_tree(path)):
        assert "https://" not in literal and "http://" not in literal, (
            f"{path.name} carries a URL literal: {literal!r}"
        )


# ==================================================================================================
# 4. The chunk_embedding insert writes exactly the PRD §35.3 five columns (item 9)
# ==================================================================================================


def test_the_insert_statement_names_exactly_the_five_columns() -> None:
    """Parsed from the constant, not regexed out of the file.

    The Q11 pins stay in the manifest (sub-PRD D14); a sixth column here would put one PRD §44.3
    serial-owned contract inside another.
    """
    from embeddings.persist import CHUNK_EMBEDDING_COLUMNS, INSERT_CHUNK_EMBEDDING

    expected = ("search_chunk_id", "profile_id", "vector_key", "dimensions", "quantisation")
    assert CHUNK_EMBEDDING_COLUMNS == expected

    match = re.search(r"INSERT INTO chunk_embedding\s*\(([^)]*)\)", INSERT_CHUNK_EMBEDDING)
    assert match is not None, INSERT_CHUNK_EMBEDDING
    columns = tuple(name.strip() for name in match.group(1).split(","))
    assert columns == expected
    assert INSERT_CHUNK_EMBEDDING.count("?") == len(expected)
    # A duplicate primary key must be loud; upsert semantics would hide a resume defect.
    assert "OR REPLACE" not in INSERT_CHUNK_EMBEDDING.upper()
    assert "ON CONFLICT" not in INSERT_CHUNK_EMBEDDING.upper()


CORPUS_TABLES_THIS_MODULE_MAY_NOT_WRITE = (
    "search_chunk",
    "node_version",
    "legal_document",
    "document_version",
    "document_node",
    "corpus_release",
    "corpus_meta",
    "source",
    "authority",
    "licence_assessment",
    "licence_snapshot",
    "source_artifact",
    "ingestion_run",
    "node_relation",
    "legal_event",
)


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_other_corpus_table_is_written(path: Path) -> None:
    """`chunk_embedding` is the only table this pipeline writes (deliverable 3 step 5)."""
    for literal in _string_literals(_tree(path)):
        upper = literal.upper()
        if not any(verb in upper for verb in ("INSERT INTO", "UPDATE ", "DELETE FROM", "DROP ", "ALTER ")):
            continue
        for table in CORPUS_TABLES_THIS_MODULE_MAY_NOT_WRITE:
            assert re.search(rf"\b{table}\b", literal) is None, (
                f"{path.name} writes to {table}: {literal!r}"
            )


# ==================================================================================================
# 5. Credential-shape guard — CI's whole-tree secret scan will not forgive this
# ==================================================================================================

CREDENTIAL_SHAPED = re.compile(
    r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIALS?)(?:_[A-Z0-9]+)*\b"
)


@pytest.mark.parametrize(
    "path",
    sorted(SRC.glob("*.py")) + sorted(TESTS.glob("*.py")),
    ids=lambda path: path.name,
)
def test_no_credential_shaped_identifier(path: Path) -> None:
    """`.github/workflows/checks/secret-scan.mjs` scans every git-tracked file.

    Its `key` pattern is ALL-CAPS only, so the lowercase `vector_key` column the ticket mandates is
    safe, while the upper-cased spelling of that same name would not be. CRPS-02's Python scanner
    has `SCAN_ROOTS` that do not include this module, so it will not catch a violation here — CI
    would, at the end of the run. This is that check, brought forward.

    THIS FILE IS SCANNED BY ITSELF, and the whole-tree CI scan reads it too, so the positive
    control below assembles its example at run time rather than writing it out. A test that trips
    the guard it is testing is not a hypothetical: this one did, on first run.
    """
    offenders = CREDENTIAL_SHAPED.findall(path.read_text(encoding="utf-8"))
    assert offenders == [], f"{path.name}: {sorted(set(offenders))}"


def test_the_credential_pattern_is_not_vacuous() -> None:
    positive = "VECTOR" + "_" + "KEY"
    assert CREDENTIAL_SHAPED.findall(f"{positive} = 1") == [positive]
    assert CREDENTIAL_SHAPED.findall("vector_key = 1") == []
    assert CREDENTIAL_SHAPED.findall("AWS" + "_SECRET" + "_ACCESS" + "_KEY = 1")


# ==================================================================================================
# 6. No silent stub fallback — the worst failure available in this pipeline
# ==================================================================================================


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_import_error_handler_yields_a_provider(path: Path) -> None:
    """`except ImportError: return DeterministicStubProvider(...)` must not exist anywhere."""
    for node in ast.walk(_tree(path)):
        if not isinstance(node, ast.ExceptHandler):
            continue
        handler_source = ast.dump(node)
        assert "DeterministicStubProvider" not in handler_source, (
            f"{path.name} constructs a stub provider inside an exception handler"
        )


@pytest.mark.parametrize("path", MODULES, ids=lambda path: path.name)
def test_no_or_default_stub_construction(path: Path) -> None:
    """`provider or DeterministicStubProvider(...)` and `provider=DeterministicStub...()` too."""
    tree = _tree(path)
    for node in ast.walk(tree):
        if isinstance(node, ast.BoolOp) and isinstance(node.op, ast.Or):
            assert "DeterministicStubProvider" not in ast.dump(node), f"{path.name}: `or` fallback"
        if isinstance(node, ast.IfExp):
            assert "DeterministicStubProvider" not in ast.dump(node), f"{path.name}: ternary fallback"

    # And no default argument value anywhere is a provider.
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            defaults = node.args.defaults + [d for d in node.args.kw_defaults if d is not None]
            for default in defaults:
                assert "Provider" not in ast.dump(default), (
                    f"{path.name}: {node.name} defaults a provider argument"
                )


def test_the_cli_provider_flag_is_required_and_defaultless() -> None:
    """The single most important line in `cli.py`, asserted rather than trusted."""
    from embeddings.cli import build_parser

    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "build",
                "--corpus",
                "c.sqlite",
                "--profile",
                "p.json",
                "--runtime-pin",
                "r.json",
                "--out",
                "o",
            ]
        )


def test_build_embeddings_takes_the_provider_positionally_with_no_default() -> None:
    import inspect

    from embeddings.build import build_embeddings

    parameter = inspect.signature(build_embeddings).parameters["provider"]
    assert parameter.default is inspect.Parameter.empty
    assert parameter.kind is inspect.Parameter.POSITIONAL_OR_KEYWORD


# ==================================================================================================
# 7. threads=1 at every USearch add() call site — see vectors.py's docstring
# ==================================================================================================


def test_every_usearch_add_call_passes_threads_one() -> None:
    """Runs UNCONDITIONALLY, including where usearch is not installed.

    Multi-threaded HNSW insertion is byte-non-deterministic, which would fail the ticket's
    determinism criterion for a signed release artifact. A future edit adding threads "for speed"
    must fail here rather than silently.
    """
    tree = _tree(SRC / "vectors.py")
    add_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "add"
        and isinstance(node.func.value, ast.Attribute)
        and node.func.value.attr == "_index"
    ]
    assert add_calls, "no self._index.add(...) call site found; has vectors.py been restructured?"
    for call in add_calls:
        threads = [kw for kw in call.keywords if kw.arg == "threads"]
        assert threads, "an index add() call site omits threads="
        assert isinstance(threads[0].value, ast.Constant) and threads[0].value.value == 1


def test_the_index_parameters_are_explicit_constants() -> None:
    """Library defaults are a version-dependent input to a signed artifact's bytes."""
    from embeddings.vectors import CONNECTIVITY, EXPANSION_ADD, EXPANSION_SEARCH

    assert (CONNECTIVITY, EXPANSION_ADD, EXPANSION_SEARCH) == (16, 128, 64)
    tree = _tree(SRC / "vectors.py")
    index_calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Index"
    ]
    assert len(index_calls) == 1
    supplied = {kw.arg for kw in index_calls[0].keywords}
    assert {"ndim", "metric", "dtype", "connectivity", "expansion_add", "expansion_search"} <= supplied
