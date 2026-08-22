"""A generic, dependency-free reader for a strict, documented YAML subset.

WHY THIS EXISTS. The file name `allowlist.yaml` is fixed by INGF-02 deliverable 1 and by the 52
adapter tickets that will write one, so JSON is not an option. PyYAML is not installed and cannot be
installed by this ticket: every uv workspace member declares `[tool.uv] package = false`, so a
member's `dependencies` contribute nothing to the environment `uv run pytest` builds at the
repository root (PRD §45.3), and the root manifest is a PRD §44.3 serial-owned artifact belonging to
`00-foundation`. This follows the precedent `contracts/jsonschema_min.py` set for the same reason.

WHY THERE IS NO OPTIONAL-LIBRARY BRANCH. A `try: import yaml / except ImportError:` fallback would
give the security-critical allowlist loader two parsers with two behaviours, and the one that ran
would depend on which machine ran it. There is exactly one code path here.

WHAT IT IS NOT. It contains no fetch-shaped or allowlist-shaped vocabulary: no host, no scheme, no
policy. It is driven purely by the text it is handed, exactly as a real YAML library would be, and
`test_allowlist.py` asserts that property so this module cannot quietly grow into the loader.

THE SUBSET — everything else is a loud `YamlSubsetError`, never a silent skip:

* UTF-8 text, LF or CRLF line endings, no tab characters anywhere;
* `#` comments, whole-line or trailing (a `#` inside a double-quoted scalar is data);
* block mappings `key: value`, nested by exactly two spaces per level;
* block sequences, `- scalar` and `- key: value` (a mapping item, continued at the item's indent);
* flow sequences of scalars on one line: `[]`, `[a, b]`;
* scalars: `null` / `~` / empty (None), `true` / `false`, integers, and strings — either
  double-quoted (with `\\`, `\"`, `\n`, `\t` escapes) or plain.

REJECTED, deliberately: tabs, anchors `&`, aliases `*`, tags `!`, multiple documents `---`, block
scalars `|` / `>`, flow mappings `{}`, single-quoted scalars, duplicate keys, an indent that is not
a multiple of two or that skips a level, and any line this module cannot classify. A permissive
parser in front of a security policy is a liability: the loader must fail rather than guess.
"""

from __future__ import annotations

from typing import Any

__all__ = ["YamlSubsetError", "parse_yaml_subset"]


class YamlSubsetError(ValueError):
    """The document uses syntax outside the supported subset, or is malformed."""

    def __init__(self, message: str, line: int | None = None) -> None:
        self.line = line
        super().__init__(message if line is None else f"line {line}: {message}")


_REJECTED_PREFIXES: tuple[tuple[str, str], ...] = (
    ("&", "anchors are not supported"),
    ("*", "aliases are not supported"),
    ("!", "tags are not supported"),
    ("{", "flow mappings are not supported"),
    ("|", "block scalars are not supported"),
    (">", "folded block scalars are not supported"),
    ("'", "single-quoted scalars are not supported; use double quotes"),
    ("%", "directives are not supported"),
)


class _Line:
    __slots__ = ("indent", "text", "number")

    def __init__(self, indent: int, text: str, number: int) -> None:
        self.indent = indent
        self.text = text
        self.number = number


def _strip_comment(raw: str, number: int) -> str:
    """Remove a trailing `#` comment, honouring double-quoted scalars."""
    out: list[str] = []
    in_quotes = False
    index = 0
    while index < len(raw):
        char = raw[index]
        if in_quotes:
            if char == "\\":
                if index + 1 >= len(raw):
                    raise YamlSubsetError("a double-quoted scalar ends with a dangling escape", number)
                out.append(char)
                out.append(raw[index + 1])
                index += 2
                continue
            if char == '"':
                in_quotes = False
            out.append(char)
            index += 1
            continue
        if char == '"':
            in_quotes = True
            out.append(char)
            index += 1
            continue
        if char == "#" and (index == 0 or raw[index - 1] in " \t"):
            break
        out.append(char)
        index += 1
    if in_quotes:
        raise YamlSubsetError("unterminated double-quoted scalar", number)
    return "".join(out).rstrip()


def _read_lines(text: str) -> list[_Line]:
    lines: list[_Line] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if "\t" in raw:
            raise YamlSubsetError("tab characters are not permitted; indent with spaces", number)
        stripped = _strip_comment(raw, number)
        if not stripped.strip():
            continue
        if stripped.lstrip().startswith("---") or stripped.lstrip().startswith("..."):
            raise YamlSubsetError("document markers are not supported (single document only)", number)
        indent = len(stripped) - len(stripped.lstrip(" "))
        if indent % 2 != 0:
            raise YamlSubsetError(f"indent {indent} is not a multiple of two", number)
        lines.append(_Line(indent, stripped.strip(), number))
    return lines


def _parse_scalar(token: str, number: int) -> Any:
    token = token.strip()
    if token == "" or token in {"null", "~"}:
        return None
    if token == "true":
        return True
    if token == "false":
        return False
    if token.startswith("["):
        return _parse_flow_sequence(token, number)
    for prefix, why in _REJECTED_PREFIXES:
        if token.startswith(prefix):
            raise YamlSubsetError(why, number)
    if token.startswith('"'):
        return _parse_quoted(token, number)
    if _is_integer(token):
        return int(token)
    if '"' in token:
        raise YamlSubsetError("a double quote inside a plain scalar is ambiguous", number)
    if token.endswith(":") or ": " in token:
        raise YamlSubsetError("a plain scalar may not contain a mapping separator", number)
    return token


def _is_integer(token: str) -> bool:
    body = token[1:] if token[:1] in "+-" else token
    return bool(body) and body.isdigit()


def _parse_quoted(token: str, number: int) -> str:
    if len(token) < 2 or not token.endswith('"'):
        raise YamlSubsetError("unterminated double-quoted scalar", number)
    body = token[1:-1]
    out: list[str] = []
    index = 0
    while index < len(body):
        char = body[index]
        if char == "\\":
            if index + 1 >= len(body):
                raise YamlSubsetError("dangling escape in a double-quoted scalar", number)
            escape = body[index + 1]
            mapped = {"\\": "\\", '"': '"', "n": "\n", "t": "\t", "/": "/"}.get(escape)
            if mapped is None:
                raise YamlSubsetError(f"unsupported escape \\{escape}", number)
            out.append(mapped)
            index += 2
            continue
        if char == '"':
            raise YamlSubsetError("an unescaped quote inside a double-quoted scalar", number)
        out.append(char)
        index += 1
    return "".join(out)


def _split_flow_items(body: str, number: int) -> list[str]:
    items: list[str] = []
    current: list[str] = []
    in_quotes = False
    index = 0
    while index < len(body):
        char = body[index]
        if in_quotes:
            if char == "\\":
                current.append(char)
                if index + 1 < len(body):
                    current.append(body[index + 1])
                index += 2
                continue
            if char == '"':
                in_quotes = False
            current.append(char)
            index += 1
            continue
        if char == '"':
            in_quotes = True
            current.append(char)
            index += 1
            continue
        if char == ",":
            items.append("".join(current))
            current = []
            index += 1
            continue
        if char in "[]{}":
            raise YamlSubsetError("nested flow collections are not supported", number)
        current.append(char)
        index += 1
    if in_quotes:
        raise YamlSubsetError("unterminated double-quoted scalar in a flow sequence", number)
    tail = "".join(current).strip()
    if tail:
        items.append(tail)
    elif items:
        raise YamlSubsetError("a trailing comma in a flow sequence", number)
    return [item.strip() for item in items]


def _parse_flow_sequence(token: str, number: int) -> list[Any]:
    if not token.endswith("]"):
        raise YamlSubsetError("unterminated flow sequence", number)
    body = token[1:-1].strip()
    if not body:
        return []
    return [_parse_scalar(item, number) for item in _split_flow_items(body, number)]


def _split_key(text: str, number: int) -> tuple[str, str] | None:
    """Split `key: rest`, returning `None` when *text* is not a mapping entry."""
    in_quotes = False
    index = 0
    while index < len(text):
        char = text[index]
        if char == '"':
            in_quotes = not in_quotes
        elif char == ":" and not in_quotes:
            if index + 1 == len(text) or text[index + 1] == " ":
                return text[:index].strip(), text[index + 1 :].strip()
        index += 1
    return None


def _check_key(key: str, number: int) -> str:
    if key.startswith('"'):
        key = _parse_quoted(key, number)
    if not key or any(char in key for char in " \t#&*!|>{}[]"):
        raise YamlSubsetError(f"unsupported mapping key {key!r}", number)
    return key


class _Cursor:
    __slots__ = ("lines", "index")

    def __init__(self, lines: list[_Line]) -> None:
        self.lines = lines
        self.index = 0

    def peek(self) -> _Line | None:
        return self.lines[self.index] if self.index < len(self.lines) else None


def _parse_block(cursor: _Cursor, indent: int) -> Any:
    first = cursor.peek()
    assert first is not None
    if first.text.startswith("- ") or first.text == "-":
        return _parse_sequence(cursor, indent)
    return _parse_mapping(cursor, indent)


def _parse_mapping(cursor: _Cursor, indent: int) -> dict[str, Any]:
    result: dict[str, Any] = {}
    while True:
        line = cursor.peek()
        if line is None or line.indent < indent:
            return result
        if line.indent > indent:
            raise YamlSubsetError("unexpected indent inside a mapping", line.number)
        split = _split_key(line.text, line.number)
        if split is None:
            raise YamlSubsetError(f"cannot classify {line.text!r} as a mapping entry", line.number)
        key, rest = split
        key = _check_key(key, line.number)
        if key in result:
            raise YamlSubsetError(f"duplicate key {key!r}", line.number)
        cursor.index += 1
        if rest:
            result[key] = _parse_scalar(rest, line.number)
            continue
        child = cursor.peek()
        if child is not None and child.indent > indent:
            if child.indent != indent + 2 and not child.text.startswith("-"):
                raise YamlSubsetError("nesting must indent by exactly two spaces", child.number)
            if child.text.startswith("-") and child.indent not in (indent, indent + 2):
                raise YamlSubsetError("a sequence must indent by zero or two spaces", child.number)
            result[key] = _parse_block(cursor, child.indent)
        elif child is not None and child.indent == indent and child.text.startswith("- "):
            result[key] = _parse_sequence(cursor, indent)
        else:
            result[key] = None


def _parse_sequence(cursor: _Cursor, indent: int) -> list[Any]:
    result: list[Any] = []
    while True:
        line = cursor.peek()
        if line is None or line.indent < indent:
            return result
        if line.indent > indent:
            raise YamlSubsetError("unexpected indent inside a sequence", line.number)
        if not (line.text.startswith("- ") or line.text == "-"):
            return result
        body = line.text[2:].strip() if line.text.startswith("- ") else ""
        item_indent = indent + 2
        split = _split_key(body, line.number) if body else None
        if split is not None:
            # A mapping item: rewrite the inline remainder as the item's first mapping line, so the
            # continuation lines (at `item_indent`) belong to the same mapping.
            cursor.lines[cursor.index] = _Line(item_indent, body, line.number)
            result.append(_parse_mapping(cursor, item_indent))
            continue
        cursor.index += 1
        if body:
            result.append(_parse_scalar(body, line.number))
            continue
        child = cursor.peek()
        if child is not None and child.indent >= item_indent:
            result.append(_parse_block(cursor, child.indent))
        else:
            result.append(None)


def parse_yaml_subset(text: str) -> Any:
    """Parse *text*; raise `YamlSubsetError` on anything outside the documented subset."""
    if not isinstance(text, str):
        raise YamlSubsetError("expected text")
    lines = _read_lines(text)
    if not lines:
        return None
    if lines[0].indent != 0:
        raise YamlSubsetError("the document must start at column zero", lines[0].number)
    cursor = _Cursor(lines)
    value = _parse_block(cursor, 0)
    remaining = cursor.peek()
    if remaining is not None:
        raise YamlSubsetError(f"cannot classify {remaining.text!r}", remaining.number)
    return value
