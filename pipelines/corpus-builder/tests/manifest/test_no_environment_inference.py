"""Acceptance item 11, second half — a source scan proving no pin is ever inferred.

Breakdown plan §8 Q11: the runtime and model pins are explicit inputs, "never a locally invented
default". A docstring saying so is not evidence; this is. The ONE permitted occurrence is the
signing-key PATH variable in `signing.py`, allow-listed by name and by file.
"""

from __future__ import annotations

import io
import re
import tokenize
from pathlib import Path

import pytest
from manifest_fixtures import REPO_ROOT

SOURCE_DIR = REPO_ROOT / "pipelines" / "corpus-builder" / "src" / "manifest"

#: Every way a value could sneak in from outside the caller's explicit arguments.
FORBIDDEN = {
    "os.environ": r"os\.environ",
    "os.getenv": r"os\.getenv",
    "getenv": r"\bgetenv\b",
    "importlib.metadata": r"importlib\.metadata|importlib_metadata",
    "pkg_resources": r"\bpkg_resources\b",
    "subprocess": r"\bsubprocess\b",
    "Cargo.toml": r"Cargo\.toml",
    "Cargo.lock": r"Cargo\.lock",
    "uv.lock": r"uv\.lock",
    "platform module": r"\bplatform\.\w",
    "sys.version": r"sys\.version",
    "shutil.which": r"shutil\.which",
    "socket": r"\bsocket\b",
    "urllib": r"\burllib\b",
    "requests": r"\brequests\b",
}

#: file name -> the exact lines that may carry an otherwise-forbidden token.
ALLOWED = {
    ("signing.py", "os.environ"),
    ("signing.py", "os.getenv"),
    ("signing.py", "getenv"),
}


def _sources() -> list[Path]:
    return sorted(SOURCE_DIR.glob("*.py"))


def _code_lines(path: Path) -> list[tuple[int, str]]:
    """`(line number, source)` for EXECUTABLE code only.

    Comments, docstrings and every other string literal are dropped: this module's docstrings
    necessarily *name* the things they promise not to do ("reads no environment variable"), and a
    scanner that cannot tell prose from code would either fail on its own documentation or be
    silenced by deleting the documentation. Tokenising is the honest way to draw that line.
    """
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    blanked = [list(line) for line in lines]
    dropped = {tokenize.COMMENT, tokenize.STRING} | {
        getattr(tokenize, name) for name in ("FSTRING_START", "FSTRING_MIDDLE", "FSTRING_END")
        if hasattr(tokenize, name)
    }
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type not in dropped:
            continue
        (first_row, first_column), (last_row, last_column) = token.start, token.end
        for row in range(first_row, last_row + 1):
            if row - 1 >= len(blanked):
                continue
            start = first_column if row == first_row else 0
            end = last_column if row == last_row else len(blanked[row - 1])
            for column in range(start, min(end, len(blanked[row - 1]))):
                blanked[row - 1][column] = " "
    return [(number, "".join(row)) for number, row in enumerate(blanked, start=1) if "".join(row).strip()]


def test_the_scan_reads_something() -> None:
    """A scan that inspects no file discharges nothing."""
    assert len(_sources()) >= 9


@pytest.mark.parametrize("label,pattern", sorted(FORBIDDEN.items()))
def test_no_source_infers_a_value_from_its_environment(label: str, pattern: str) -> None:
    offenders = []
    for path in _sources():
        if (path.name, label) in ALLOWED:
            continue
        for number, line in _code_lines(path):
            if re.search(pattern, line):
                offenders.append(f"{path.name}:{number}: {line.strip()}")
    assert offenders == [], (
        f"{label} appears in src/manifest/**; breakdown plan §8 Q11 makes every runtime and model "
        f"value an explicit input:\n" + "\n".join(offenders)
    )


def test_the_one_environment_read_is_the_signing_key_path_and_nothing_else() -> None:
    from manifest.signing import SIGNING_KEYFILE_ENV

    text = (SOURCE_DIR / "signing.py").read_text(encoding="utf-8")
    reads = re.findall(r"os\.environ\.get\(([^)]*)\)", text)
    assert reads == ["SIGNING_KEYFILE_ENV"], reads
    assert SIGNING_KEYFILE_ENV.endswith("KEYFILE"), "the variable must name a FILE PATH"


def test_no_module_other_than_signing_imports_os_environ() -> None:
    for path in _sources():
        if path.name == "signing.py":
            continue
        code = " ".join(line for _, line in _code_lines(path))
        assert "environ" not in code, path.name


def test_the_code_scanner_can_tell_code_from_prose(tmp_path: Path) -> None:
    """A positive control: the tokeniser must still SEE a real environment read."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        '"""This docstring mentions os.environ and must be ignored."""\n'
        "import os  # os.environ in a comment is ignored too\n"
        "value = os.environ.get('X')\n",
        encoding="utf-8",
    )
    hits = [line for _, line in _code_lines(sample) if "environ" in line]
    assert len(hits) == 1 and "get" in hits[0]


def test_no_default_pin_value_is_written_into_the_source() -> None:
    """Nothing here may name a real model, tokenizer or runtime — the ticket writes no value."""
    forbidden_values = ("onnxruntime", "sentence-transformers", "bge-", "e5-", "gte-", "minilm")
    for path in _sources():
        text = path.read_text(encoding="utf-8").lower()
        for value in forbidden_values:
            assert value not in text, f"{path.name} names a concrete model/runtime value: {value}"
