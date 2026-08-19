"""A dependency-free loader and writer for the restricted YAML subset this dataset uses.

WHY THIS EXISTS. Sub-PRD D17 makes evaluation cases and `evals/splits/*.yaml` YAML documents, and
no third-party Python package is importable in the environment `uv sync --frozen && uv run pytest`
builds at the repository root: the root manifest is a virtual project (`[tool.uv] package = false`,
`dependencies = []`) and every `pipelines/*` member is too, so a member's dependency lands in
`uv.lock` and is never installed. The root manifest and lockfile are PRD §44.3 serial-owned by
`00-foundation` and outside this ticket's file-scope. The same reasoning, and the same answer, as
`pipelines/corpus-builder/src/contracts/jsonschema_min.py`.

WHAT IT IS NOT. It is not a YAML implementation. It is a **restricted subset** reader, and every
construct outside that subset is a hard error (`UnsupportedYamlError`) rather than a silent skip —
this parser reads case files authored by ten sibling tickets, and a construct it quietly ignored
would be data that no check ever saw. There is no `eval`, no `exec`, no dynamic import and no
object construction of any kind: the only values it can produce are `dict`, `list`, `str`, `int`,
`float`, `bool` and `None`.

SUPPORTED
  block mappings; block sequences; arbitrary nesting; plain scalars; single- and double-quoted
  scalars; `|` and `>` block scalars with the `-`/`+` chomping indicators; `#` comments; a single
  leading `---`; `true`/`false`/`null`/`~`; integers and floats; the empty flow collections `[]`
  and `{}`.

REJECTED, EXPLICITLY
  anchors (`&`) and aliases (`*`); tags (`!`, `!!`); non-empty flow collections; more than one
  document; tabs in indentation; a document larger than `MAX_BYTES`; nesting deeper than
  `MAX_DEPTH`. A `YYYY-MM-DD` scalar stays a **string** and is never coerced to `datetime.date`,
  so a YAML -> JSON round trip is lossless (PRD §35.1 dates travel as strings).

ERROR MESSAGES ARE CONTENT-FREE, AND THAT IS A SECURITY PROPERTY, NOT A STYLE RULE. A parse failure
of a file under a `blind/` path is reported by `SCHEMA_VALID` through `compose`, and a finding is
rendered to stdout, to a JSON report and into CI logs. A message that quoted the offending source
fragment would therefore publish a fragment of blind plaintext through the ordinary failure path —
the exact leak sub-PRD D1/D2 exist to prevent. So every `YamlError` message names the LINE NUMBER
and the CONSTRUCT, never the text that failed: no `{content!r}`, no `{key!r}`, no `{remainder!r}`,
no source excerpt of any kind. `tests/dataset/test_yaml_min.py` greps this module for that shape,
and `tests/dataset/test_findings_content_free.py` proves the property end to end. Callers that put
a parse failure into a user-visible message use `YamlError.reason`, which is content-free by this
invariant.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

__all__ = [
    "MAX_BYTES",
    "MAX_DEPTH",
    "UnsupportedYamlError",
    "YamlError",
    "dump",
    "load",
    "load_path",
]

#: A pathological case file must not be able to hang the checker (plan R8).
MAX_BYTES = 4 * 1024 * 1024
MAX_DEPTH = 32


class YamlError(ValueError):
    """The document is not well formed in this subset.

    The message names the line number and the construct only — see the module header for why that
    is a hard invariant rather than a preference.
    """

    @property
    def reason(self) -> str:
        """A content-free reason string, safe to render in a `Finding` message.

        Callers use THIS rather than `str(error)` so that the safe form is the obvious form, and so
        a single grep finds every place a parse failure becomes user-visible text.
        """
        return f"{type(self).__name__}: {self.args[0] if self.args else 'parse failed'}"


class UnsupportedYamlError(YamlError):
    """The document uses a YAML construct this subset deliberately refuses to interpret."""


_INT_RE = re.compile(r"^[+-]?[0-9]+$")
_FLOAT_RE = re.compile(r"^[+-]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$")


def load_path(path: Path | str) -> Any:
    """Read *path* as UTF-8 and load it. Byte size is checked before any parsing happens."""
    raw = Path(path).read_bytes()
    if len(raw) > MAX_BYTES:
        raise UnsupportedYamlError(f"{len(raw)} bytes exceeds the {MAX_BYTES}-byte limit")
    return load(raw.decode("utf-8"))


def load(text: str) -> Any:
    """Load one YAML document from *text*. Returns `None` for an empty document."""
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise UnsupportedYamlError(f"document exceeds the {MAX_BYTES}-byte limit")
    return _Parser(text).parse()


# -- parsing ---------------------------------------------------------------------------------------


class _Parser:
    def __init__(self, text: str) -> None:
        self.lines: list[str] = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        self.index = 0
        self._seen_document_start = False
        self._seen_content = False

    # -- line handling -----------------------------------------------------------------------

    def _significant(self) -> tuple[int, int, str] | None:
        """Return `(line_index, indent, content)` of the next significant line, or `None`."""
        while self.index < len(self.lines):
            raw = self.lines[self.index]
            stripped = raw.strip()
            if stripped == "" or stripped.startswith("#"):
                self.index += 1
                continue
            if stripped == "---":
                if self._seen_document_start or self._seen_content:
                    raise UnsupportedYamlError(
                        f"line {self.index + 1}: more than one document; this subset reads exactly one"
                    )
                self._seen_document_start = True
                self.index += 1
                continue
            if stripped == "...":
                raise UnsupportedYamlError(f"line {self.index + 1}: document end markers are not supported")
            leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
            if "\t" in leading:
                raise UnsupportedYamlError(f"line {self.index + 1}: tab in indentation")
            self._seen_content = True
            return self.index, len(leading), raw[len(leading) :].rstrip()
        return None

    # -- entry point -------------------------------------------------------------------------

    def parse(self) -> Any:
        head = self._significant()
        if head is None:
            return None
        _, indent, _ = head
        value = self._parse_block(indent, depth=0)
        trailing = self._significant()
        if trailing is not None:
            raise YamlError(f"line {trailing[0] + 1}: trailing content after the document body")
        return value

    def _parse_block(self, indent: int, *, depth: int) -> Any:
        if depth > MAX_DEPTH:
            raise UnsupportedYamlError(f"nesting deeper than {MAX_DEPTH} levels")
        head = self._significant()
        if head is None:
            return None
        _, line_indent, content = head
        if line_indent != indent:
            raise YamlError(f"unexpected indentation {line_indent}, expected {indent}")
        if content == "-" or content.startswith("- "):
            return self._parse_sequence(indent, depth=depth)
        return self._parse_mapping(indent, depth=depth)

    def _parse_mapping(self, indent: int, *, depth: int) -> dict[str, Any]:
        result: dict[str, Any] = {}
        while True:
            head = self._significant()
            if head is None:
                break
            line_index, line_indent, content = head
            if line_indent < indent:
                break
            if line_indent > indent:
                raise YamlError(f"line {line_index + 1}: unexpected indentation inside a mapping")
            split = _split_mapping_entry(content)
            if split is None:
                raise YamlError(f"line {line_index + 1}: not a mapping entry")
            key_text, value_text = split
            key = _parse_key(key_text, line_index)
            if key in result:
                raise YamlError(f"line {line_index + 1}: duplicate mapping key")
            self.index = line_index + 1
            result[key] = self._parse_value(value_text, indent, line_index, depth=depth)
        return result

    def _parse_sequence(self, indent: int, *, depth: int) -> list[Any]:
        items: list[Any] = []
        while True:
            head = self._significant()
            if head is None:
                break
            line_index, line_indent, content = head
            if line_indent < indent:
                break
            if line_indent > indent or not (content == "-" or content.startswith("- ")):
                raise YamlError(f"line {line_index + 1}: expected a sequence entry at indent {indent}")
            raw = self.lines[line_index]
            rest = content[1:]
            if rest.strip() == "":
                self.index = line_index + 1
                items.append(self._parse_nested(indent, depth=depth))
                continue
            item_column = indent + 1 + (len(rest) - len(rest.lstrip(" ")))
            item_text = rest.lstrip(" ")
            if _split_mapping_entry(item_text) is not None:
                # `- key: value` — rewrite the dash to a space and let the mapping parser own the
                # line, so keys aligned under `key` on following lines join the same mapping.
                self.lines[line_index] = " " * item_column + raw[item_column:]
                self.index = line_index
                items.append(self._parse_mapping(item_column, depth=depth + 1))
                continue
            if item_text.startswith("- ") or item_text == "-":
                self.lines[line_index] = " " * item_column + raw[item_column:]
                self.index = line_index
                items.append(self._parse_sequence(item_column, depth=depth + 1))
                continue
            self.index = line_index + 1
            items.append(self._parse_scalar_or_block(item_text, indent, line_index, depth=depth))
        return items

    def _parse_value(self, value_text: str, indent: int, line_index: int, *, depth: int) -> Any:
        if value_text.strip() == "" or value_text.strip().startswith("#"):
            return self._parse_nested(indent, depth=depth)
        return self._parse_scalar_or_block(value_text.strip(), indent, line_index, depth=depth)

    def _parse_nested(self, indent: int, *, depth: int) -> Any:
        head = self._significant()
        if head is None:
            return None
        _, line_indent, content = head
        if line_indent > indent:
            return self._parse_block(line_indent, depth=depth + 1)
        if line_indent == indent and (content == "-" or content.startswith("- ")):
            # A sequence may sit at the same column as the key that owns it.
            return self._parse_sequence(indent, depth=depth + 1)
        return None

    def _parse_scalar_or_block(self, text: str, indent: int, line_index: int, *, depth: int) -> Any:
        if text and text[0] in "|>":
            return self._parse_block_scalar(text, indent, line_index)
        return _scalar(text, line_index)

    def _parse_block_scalar(self, header: str, indent: int, line_index: int) -> str:
        style = header[0]
        chomp = header[1:].strip()
        if chomp not in ("", "-", "+"):
            raise UnsupportedYamlError(
                f"line {line_index + 1}: unsupported block scalar header — only `|`, `>` and the "
                "`-`/`+` chomping indicators are supported (no explicit indentation indicator)"
            )
        body: list[str] = []
        cursor = line_index + 1
        block_indent: int | None = None
        while cursor < len(self.lines):
            raw = self.lines[cursor]
            if raw.strip() == "":
                body.append("")
                cursor += 1
                continue
            leading = raw[: len(raw) - len(raw.lstrip(" \t"))]
            if "\t" in leading:
                raise UnsupportedYamlError(f"line {cursor + 1}: tab in indentation")
            if len(leading) <= indent:
                break
            if block_indent is None:
                block_indent = len(leading)
            if len(leading) < block_indent:
                break
            body.append(raw[block_indent:].rstrip())
            cursor += 1
        self.index = cursor
        while body and body[-1] == "":
            body.pop()
        text = "\n".join(body) if style == "|" else _fold(body)
        if chomp == "-":
            return text
        if chomp == "+":
            return text + "\n"
        return text + "\n" if text else ""


def _fold(body: list[str]) -> str:
    """Fold a `>` block scalar: single newlines become spaces, blank lines become newlines."""
    out: list[str] = []
    for line in body:
        if line == "":
            out.append("\n")
        elif out and not out[-1].endswith("\n"):
            out[-1] = out[-1] + " " + line
        else:
            out.append(line)
    return "".join(out)


def _split_mapping_entry(content: str) -> tuple[str, str] | None:
    """Split `key: value` at the first top-level `:` followed by whitespace or end of line."""
    quote: str | None = None
    index = 0
    while index < len(content):
        char = content[index]
        if quote is not None:
            if char == "\\" and quote == '"':
                index += 2
                continue
            if char == quote:
                quote = None
            index += 1
            continue
        if char in "\"'":
            quote = char
            index += 1
            continue
        if char == ":" and (index + 1 == len(content) or content[index + 1] in " \t"):
            return content[:index], content[index + 1 :]
        if char == "#" and index > 0 and content[index - 1] == " ":
            return None
        index += 1
    return None


def _parse_key(text: str, line_index: int) -> str:
    key = text.strip()
    if not key:
        raise YamlError(f"line {line_index + 1}: empty mapping key")
    if key[0] in "&*!":
        raise UnsupportedYamlError(
            f"line {line_index + 1}: anchors, aliases and tags are not supported in this subset"
        )
    if key[0] in "\"'":
        return _quoted(key, line_index)
    return key


def _strip_comment(text: str) -> str:
    quote: str | None = None
    for index, char in enumerate(text):
        if quote is not None:
            if char == "\\" and quote == '"':
                continue
            if char == quote:
                quote = None
            continue
        if char in "\"'":
            quote = char
            continue
        if char == "#" and index > 0 and text[index - 1] in " \t":
            return text[:index].rstrip()
    return text.rstrip()


def _quoted(text: str, line_index: int) -> str:
    quote = text[0]
    index = 1
    out: list[str] = []
    while index < len(text):
        char = text[index]
        if char == "\\" and quote == '"':
            if index + 1 >= len(text):
                raise YamlError(f"line {line_index + 1}: trailing escape in a double-quoted scalar")
            nxt = text[index + 1]
            out.append({"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\", "/": "/"}.get(nxt, nxt))
            index += 2
            continue
        if char == quote:
            if quote == "'" and index + 1 < len(text) and text[index + 1] == "'":
                out.append("'")
                index += 2
                continue
            remainder = text[index + 1 :].strip()
            if remainder and not remainder.startswith("#"):
                raise YamlError(f"line {line_index + 1}: content after a quoted scalar")
            return "".join(out)
        out.append(char)
        index += 1
    raise YamlError(f"line {line_index + 1}: unterminated quoted scalar")


def _scalar(text: str, line_index: int) -> Any:
    if not text:
        return None
    if text[0] in "\"'":
        return _quoted(text, line_index)
    if text[0] in "&*":
        raise UnsupportedYamlError(
            f"line {line_index + 1}: anchors and aliases are not supported in this subset"
        )
    if text[0] == "!":
        raise UnsupportedYamlError(f"line {line_index + 1}: tags are not supported in this subset")
    value = _strip_comment(text)
    if value in ("[]", "{}"):
        return [] if value == "[]" else {}
    if value.startswith("[") or value.startswith("{"):
        raise UnsupportedYamlError(
            f"line {line_index + 1}: non-empty flow collections are not supported; write a block "
            "sequence or block mapping instead"
        )
    if value in ("null", "Null", "NULL", "~"):
        return None
    if value in ("true", "True", "TRUE"):
        return True
    if value in ("false", "False", "FALSE"):
        return False
    if _INT_RE.match(value):
        return int(value)
    if _FLOAT_RE.match(value):
        return float(value)
    return value


# -- writing ---------------------------------------------------------------------------------------


def dump(value: Any) -> str:
    """Serialise *value* in the same subset, ending with exactly one newline.

    Round-trip is the contract: `load(dump(v)) == v` for every value this module can produce, which
    `tests/dataset/test_yaml_min.py` asserts over the repository's own YAML files.
    """
    lines: list[str] = []
    _dump_into(value, 0, lines)
    return "\n".join(lines) + "\n"


def _dump_into(value: Any, indent: int, lines: list[str]) -> None:
    pad = " " * indent
    if isinstance(value, dict):
        if not value:
            lines.append(pad + "{}")
            return
        for key, item in value.items():
            if not isinstance(key, str):
                raise YamlError(f"only string mapping keys are supported, got {type(key).__name__}")
            if isinstance(item, (dict, list)) and item:
                lines.append(f"{pad}{_scalar_out(key)}:")
                _dump_into(item, indent + 2, lines)
            else:
                lines.append(f"{pad}{_scalar_out(key)}: {_inline(item)}")
        return
    if isinstance(value, list):
        if not value:
            lines.append(pad + "[]")
            return
        for item in value:
            if isinstance(item, (dict, list)) and item:
                nested: list[str] = []
                _dump_into(item, indent + 2, nested)
                lines.append(pad + "-" + nested[0][indent + 1 :])
                lines.extend(nested[1:])
            else:
                lines.append(f"{pad}- {_inline(item)}")
        return
    lines.append(pad + _inline(value))


def _inline(value: Any) -> str:
    if isinstance(value, dict):
        return "{}"
    if isinstance(value, list):
        return "[]"
    return _scalar_out(value)


_PLAIN_SAFE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.\-/ ]*$")


def _scalar_out(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return repr(value)
    if not isinstance(value, str):
        raise YamlError(f"cannot serialise {type(value).__name__} in this subset")
    if value == "":
        return '""'
    reserved = value in ("null", "true", "false", "~", "[]", "{}")
    if not reserved and _PLAIN_SAFE.match(value) and value == value.strip() and "  " not in value:
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t")
    return f'"{escaped}"'
