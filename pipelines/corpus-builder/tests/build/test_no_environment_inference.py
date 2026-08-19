"""No pin, version or runtime fact is ever INFERRED by `src/build/**` or `src/validation/**`.

Breakdown plan §8 **Q11** (confirmed) makes every model, tokenizer and runtime value an input the
release process supplies — never a locally invented default. Deliverable 1 states it for
`BuildRequest`, and the acceptance checklist requires a SOURCE SCAN rather than a behavioural test,
because a behavioural test can only show that today's code paths do not read the environment,
whereas the scan shows there is no code that could.

Modelled on `tests/manifest/test_no_environment_inference.py`, which does the same for CRPS-02.
"""

from __future__ import annotations

import ast
import io
import tokenize
from pathlib import Path

from candidate_paths import BUILD_SRC, VALIDATION_SRC

#: Modules whose mere import would put an environment, packaging or crate fact within reach.
FORBIDDEN_MODULES = {
    "os.environ",
    "importlib.metadata",
    "importlib_metadata",
    "platform",
    "socket",
    "urllib",
    "urllib.request",
    "http",
    "http.client",
    "requests",
    "httpx",
    "boto3",
    "services",
    "services.search_rs",
    "search_rs",
    "usearch",
    "numpy",
    "embeddings",
}

#: Call targets that read the machine rather than the request.
FORBIDDEN_CALLS = {
    "getenv",
    "environb",
    "expandvars",
    "version",          # importlib.metadata.version
    "distribution",
    "packages_distributions",
    "gethostname",
    "getfqdn",
    "uname",
}

#: Filenames that would mean a version was read from a build system rather than supplied.
FORBIDDEN_TEXT = ("Cargo.toml", "Cargo.lock", "uv.lock", "pnpm-lock.yaml", "package-lock.json")

#: `subprocess` is permitted at EXACTLY ONE call site: `ExternalLexicalIndexBuilder`, the ADR 0003
#: option-(a) index builder, whose command is an explicit `BuildRequest` input, is invoked with
#: `shell=False` on a fixed argv, and never searches `PATH`. Nothing else in either tree may spawn
#: a process.
SUBPROCESS_ALLOWED_FILES = {"indexes.py"}


def _sources() -> list[tuple[str, str]]:
    return [
        (path.name, path.read_text(encoding="utf-8"))
        for path in sorted([*BUILD_SRC.rglob("*.py"), *VALIDATION_SRC.rglob("*.py")])
    ]


def _code_only(source: str) -> str:
    """*source* with comments, docstrings and every other string literal blanked out.

    The same tokenising `tests/manifest/test_no_environment_inference.py` uses, for the same reason:
    these modules' docstrings necessarily NAME the things they promise not to do ("never an
    environment lookup, a lockfile read or a `Cargo.toml`"), so a scanner that cannot tell prose
    from code would either fail on its own documentation or be silenced by deleting it.
    """
    lines = [list(line) for line in source.splitlines()]
    dropped = {tokenize.COMMENT, tokenize.STRING} | {
        getattr(tokenize, name)
        for name in ("FSTRING_START", "FSTRING_MIDDLE", "FSTRING_END")
        if hasattr(tokenize, name)
    }
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type not in dropped:
            continue
        (first_row, first_column), (last_row, last_column) = token.start, token.end
        for row in range(first_row, last_row + 1):
            if row - 1 >= len(lines):
                continue
            start = first_column if row == first_row else 0
            end = last_column if row == last_row else len(lines[row - 1])
            for column in range(start, min(end, len(lines[row - 1]))):
                lines[row - 1][column] = " "
    return "\n".join("".join(row) for row in lines)


def _code_sources() -> list[tuple[str, str]]:
    return [(name, _code_only(text)) for name, text in _sources()]


def test_the_tokeniser_sees_real_code_and_ignores_prose(tmp_path: Path) -> None:
    """A positive control: prose is dropped, an actual read is not."""
    sample = (
        '"""This docstring mentions os.environ and Cargo.toml and must be ignored."""\n'
        "import os  # os.environ in a comment is ignored too\n"
        "value = os.environ.get('X')\n"
    )
    code = _code_only(sample)
    assert code.count("environ") == 1
    assert "Cargo.toml" not in code


def test_the_scan_actually_reads_the_two_trees() -> None:
    """A scan that found no files would make every assertion below vacuous."""
    names = {name for name, _ in _sources()}
    assert {"plan.py", "assemble.py", "gates.py", "cli.py"} <= names


def test_no_forbidden_module_is_imported() -> None:
    offenders: list[tuple[str, str]] = []
    for name, text in _sources():
        tree = ast.parse(text, filename=name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if alias.name in FORBIDDEN_MODULES or root in FORBIDDEN_MODULES:
                        offenders.append((name, alias.name))
            elif isinstance(node, ast.ImportFrom) and node.module is not None:
                root = node.module.split(".")[0]
                if node.module in FORBIDDEN_MODULES or root in FORBIDDEN_MODULES:
                    offenders.append((name, node.module))
    assert offenders == []


def test_subprocess_is_imported_only_by_the_single_adr_selected_call_site() -> None:
    offenders: list[str] = []
    for name, text in _sources():
        if name in SUBPROCESS_ALLOWED_FILES:
            continue
        tree = ast.parse(text, filename=name)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import) and any(
                alias.name.split(".")[0] == "subprocess" for alias in node.names
            ):
                offenders.append(name)
            if isinstance(node, ast.ImportFrom) and (node.module or "").split(".")[0] == "subprocess":
                offenders.append(name)
    assert offenders == []


def test_the_allowed_subprocess_call_site_never_uses_a_shell() -> None:
    code = _code_only((BUILD_SRC / "indexes.py").read_text(encoding="utf-8"))
    assert "shell=True" not in code
    assert "shell=False" in code
    # `PATH` is never searched: the command is an explicit input and is checked for existence.
    assert "shutil.which" not in code
    assert "environ" not in code


def test_no_environment_reading_call_appears() -> None:
    offenders: list[tuple[str, str]] = []
    for name, text in _sources():
        tree = ast.parse(text, filename=name)
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            target = node.func
            if isinstance(target, ast.Attribute) and target.attr in FORBIDDEN_CALLS:
                offenders.append((name, target.attr))
            if isinstance(target, ast.Name) and target.id in FORBIDDEN_CALLS:
                offenders.append((name, target.id))
    assert offenders == []


def test_no_environ_subscript_appears() -> None:
    offenders = [name for name, code in _code_sources() if "environ" in code]
    assert offenders == []


def test_no_build_system_file_is_named() -> None:
    offenders = [
        (name, needle)
        for name, code in _code_sources()
        for needle in FORBIDDEN_TEXT
        if needle in code
    ]
    assert offenders == []


def test_no_default_pin_literal_appears_in_the_request_module() -> None:
    """`BuildRequest` must default no pin: an absent pin is a gate rejection, never a fallback."""
    text = (BUILD_SRC / "plan.py").read_text(encoding="utf-8")
    tree = ast.parse(text, filename="plan.py")
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "BuildRequest":
            for statement in node.body:
                if not isinstance(statement, ast.AnnAssign) or statement.value is None:
                    continue
                name = getattr(statement.target, "id", "")
                if name in ("local_model_pins", "runtime_pin"):
                    # The only permitted defaults are the explicit "nothing was supplied" values.
                    assert isinstance(statement.value, ast.Constant), name
                    assert statement.value.value is None, name
            break
    else:  # pragma: no cover — the class must exist
        raise AssertionError("BuildRequest was not found in plan.py")
