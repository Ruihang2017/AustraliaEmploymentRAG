"""A generic, dependency-free JSON-Schema (draft 2020-12 subset) validator.

WHY THIS EXISTS. The INR contract is validated with the `jsonschema` library wherever that library
is available. It is declared in `pipelines/corpus-builder/pyproject.toml`, but a uv **workspace
member** that is `package = false` contributes no dependency to the environment that
`uv sync --frozen` builds at the repository root — the environment `uv run pytest` (PRD §45.3, the
repository's CI entry command) then uses. Installing it would need a root `pyproject.toml` change,
and the root manifest/lockfile is a PRD §44.3 serial-owned artifact belonging to `00-foundation`,
outside this ticket's file-scope. See the build report's E1 writeback.

WHAT IT IS NOT. It is not an application module. It contains **no** knowledge of the intermediate
normalised-record contract: no record type, no member name, no corpus table. It is driven purely
by the schema documents it is handed, exactly as an off-the-shelf library is — which is what lets
`tests/contracts/test_schema_only.py` keep proving breakdown plan A4 (a source module conforms
without reading builder code) when the third-party library is absent. A test asserts that
record-shaped vocabulary never appears in this file.

SUPPORTED VOCABULARY — deliberately the subset `schema/intermediate/v1/**` uses, and nothing more:
`$ref` (including siblings, per 2020-12), `$defs`, `type`, `enum`, `const`, `required`,
`properties`, `additionalProperties`, `items`, `minLength`, `maxLength`, `minimum`, `maximum`,
`pattern`, `not`, `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else`, `dependentRequired`. An **unknown**
keyword is a hard error, not a silent pass: a schema this validator cannot fully enforce must never
be reported as satisfied (`UnsupportedKeywordError`).
"""

from __future__ import annotations

import re
from typing import Any, Iterator, Mapping, Sequence
from urllib.parse import urldefrag, urljoin

__all__ = [
    "Draft202012Validator",
    "UnsupportedKeywordError",
    "ValidationError",
    "load_documents",
]

#: Keywords that carry no assertion and are skipped without complaint.
_ANNOTATIONS = frozenset(
    {"$schema", "$id", "$defs", "$comment", "title", "description", "default", "examples"}
)

#: Every assertion keyword this validator implements.
_SUPPORTED = frozenset(
    {
        "$ref",
        "type",
        "enum",
        "const",
        "required",
        "properties",
        "additionalProperties",
        "items",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "pattern",
        "not",
        "allOf",
        "anyOf",
        "oneOf",
        "if",
        "then",
        "else",
        "dependentRequired",
    }
)

_TYPES: dict[str, Any] = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "null": type(None),
}


class UnsupportedKeywordError(RuntimeError):
    """A schema uses a keyword this validator does not implement.

    Raised rather than ignored: silently skipping an assertion turns "not checked" into "valid".
    """


class ValidationError(Exception):
    """One failed assertion, shaped like the `jsonschema` error the callers already handle."""

    def __init__(self, message: str, path: Sequence[Any], validator: str) -> None:
        super().__init__(message)
        self.message = message
        self.path = list(path)
        self.absolute_path = list(path)
        self.validator = validator

    def __repr__(self) -> str:  # pragma: no cover — diagnostics only
        return f"ValidationError({self.validator}, {self.path}, {self.message!r})"


def load_documents(paths: Sequence[Any]) -> dict[str, Any]:
    """Read each JSON file and key it by its own `$id`, ready for `Draft202012Validator`."""
    import json
    from pathlib import Path

    documents: dict[str, Any] = {}
    for path in paths:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
        documents[document["$id"]] = document
    return documents


def _matches_type(instance: Any, name: str) -> bool:
    if name == "integer":
        return isinstance(instance, int) and not isinstance(instance, bool)
    if name == "number":
        return isinstance(instance, (int, float)) and not isinstance(instance, bool)
    expected = _TYPES.get(name)
    if expected is None:
        raise UnsupportedKeywordError(f"unknown type keyword value: {name!r}")
    if expected is not bool and isinstance(instance, bool):
        # JSON `true` is not an integer/string/object; Python's bool-is-int must not leak through.
        return False
    return isinstance(instance, expected)


def _unescape(token: str) -> str:
    return token.replace("~1", "/").replace("~0", "~")


class Draft202012Validator:
    """Validate instances against *schema*, resolving `$ref` inside *documents* only.

    No `$ref` is ever fetched over the network: an unresolvable reference raises. Offline
    resolution is a hard requirement of the CRPS-01 test plan.
    """

    def __init__(
        self,
        schema: Mapping[str, Any],
        *,
        documents: Mapping[str, Any] | None = None,
    ) -> None:
        self.schema = schema
        self.documents = dict(documents or {})
        base = schema.get("$id")
        if isinstance(base, str):
            self.documents.setdefault(base, schema)
        self._base = base or ""

    # -- public API ------------------------------------------------------------------------------

    def iter_errors(self, instance: Any) -> Iterator[ValidationError]:
        yield from self._errors(self.schema, instance, self._base, [])

    def validate(self, instance: Any) -> None:
        for error in self.iter_errors(instance):
            raise error

    def is_valid(self, instance: Any) -> bool:
        return next(self.iter_errors(instance), None) is None

    # -- reference resolution --------------------------------------------------------------------

    def _resolve(self, ref: str, base: str) -> tuple[Mapping[str, Any], str]:
        uri = urljoin(base, ref)
        document_uri, fragment = urldefrag(uri)
        document = self.documents.get(document_uri)
        if document is None:
            raise UnsupportedKeywordError(
                f"$ref {ref!r} resolves to {document_uri!r}, which is not among the loaded schema "
                f"documents {sorted(self.documents)} — this validator never fetches a reference"
            )
        target: Any = document
        if fragment:
            if not fragment.startswith("/"):
                raise UnsupportedKeywordError(f"only JSON-pointer fragments are supported: {ref!r}")
            for token in fragment.split("/")[1:]:
                key = _unescape(token)
                if not isinstance(target, Mapping) or key not in target:
                    raise UnsupportedKeywordError(f"$ref {ref!r} does not resolve inside {document_uri}")
                target = target[key]
        if not isinstance(target, Mapping):
            raise UnsupportedKeywordError(f"$ref {ref!r} does not name a schema object")
        new_base = document.get("$id") if isinstance(document.get("$id"), str) else document_uri
        return target, new_base

    # -- the assertion walk ----------------------------------------------------------------------

    def _is_valid(self, schema: Mapping[str, Any], instance: Any, base: str) -> bool:
        return next(self._errors(schema, instance, base, []), None) is None

    def _errors(
        self,
        schema: Mapping[str, Any],
        instance: Any,
        base: str,
        path: list[Any],
    ) -> Iterator[ValidationError]:
        if isinstance(schema, bool):  # the boolean schema form
            if not schema:
                yield ValidationError("schema `false` rejects every instance", path, "false")
            return
        if not isinstance(schema, Mapping):
            raise UnsupportedKeywordError(f"a schema must be an object or a boolean, got {schema!r}")

        unknown = set(schema) - _SUPPORTED - _ANNOTATIONS
        if unknown:
            raise UnsupportedKeywordError(
                f"schema keyword(s) {sorted(unknown)} are not implemented by jsonschema_min; "
                "add them (with tests) rather than letting an unchecked schema pass"
            )

        if "$ref" in schema:
            target, target_base = self._resolve(str(schema["$ref"]), base)
            yield from self._errors(target, instance, target_base, path)

        if "type" in schema:
            names = schema["type"]
            names = [names] if isinstance(names, str) else list(names)
            if not any(_matches_type(instance, name) for name in names):
                yield ValidationError(
                    f"{instance!r} is not of type {' or '.join(repr(n) for n in names)}",
                    path,
                    "type",
                )
                return  # every remaining assertion would restate the same defect

        if "enum" in schema and not any(instance == option for option in schema["enum"]):
            yield ValidationError(f"{instance!r} is not one of {schema['enum']!r}", path, "enum")

        if "const" in schema and instance != schema["const"]:
            yield ValidationError(f"{instance!r} was expected to be {schema['const']!r}", path, "const")

        if "not" in schema and self._is_valid(schema["not"], instance, base):
            yield ValidationError(
                f"{instance!r} is not allowed for this schema (`not`)", path, "not"
            )

        for keyword in ("allOf",):
            for subschema in schema.get(keyword, []):
                yield from self._errors(subschema, instance, base, path)

        if "anyOf" in schema and not any(
            self._is_valid(subschema, instance, base) for subschema in schema["anyOf"]
        ):
            yield ValidationError(f"{instance!r} is not valid under any of `anyOf`", path, "anyOf")

        if "oneOf" in schema:
            matched = sum(
                1 for subschema in schema["oneOf"] if self._is_valid(subschema, instance, base)
            )
            if matched != 1:
                yield ValidationError(
                    f"{instance!r} is valid under {matched} of the `oneOf` subschemas, expected "
                    "exactly one",
                    path,
                    "oneOf",
                )

        if "if" in schema:
            branch = "then" if self._is_valid(schema["if"], instance, base) else "else"
            if branch in schema:
                yield from self._errors(schema[branch], instance, base, path)

        if isinstance(instance, str):
            yield from self._string_errors(schema, instance, path)
        elif isinstance(instance, (int, float)) and not isinstance(instance, bool):
            yield from self._number_errors(schema, instance, path)
        elif isinstance(instance, Mapping):
            yield from self._object_errors(schema, instance, base, path)
        elif isinstance(instance, list) and "items" in schema:
            for index, item in enumerate(instance):
                yield from self._errors(schema["items"], item, base, [*path, index])

    def _string_errors(
        self, schema: Mapping[str, Any], instance: str, path: list[Any]
    ) -> Iterator[ValidationError]:
        minimum = schema.get("minLength")
        if minimum is not None and len(instance) < minimum:
            yield ValidationError(f"{instance!r} is shorter than {minimum}", path, "minLength")
        maximum = schema.get("maxLength")
        if maximum is not None and len(instance) > maximum:
            yield ValidationError(f"{instance!r} is longer than {maximum}", path, "maxLength")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, instance) is None:
            yield ValidationError(f"{instance!r} does not match {pattern!r}", path, "pattern")

    def _number_errors(
        self, schema: Mapping[str, Any], instance: float, path: list[Any]
    ) -> Iterator[ValidationError]:
        minimum = schema.get("minimum")
        if minimum is not None and instance < minimum:
            yield ValidationError(f"{instance!r} is less than {minimum}", path, "minimum")
        maximum = schema.get("maximum")
        if maximum is not None and instance > maximum:
            yield ValidationError(f"{instance!r} is greater than {maximum}", path, "maximum")

    def _object_errors(
        self,
        schema: Mapping[str, Any],
        instance: Mapping[str, Any],
        base: str,
        path: list[Any],
    ) -> Iterator[ValidationError]:
        for name in schema.get("required", []):
            if name not in instance:
                yield ValidationError(f"{name!r} is a required property", path, "required")

        for name, dependents in schema.get("dependentRequired", {}).items():
            if name in instance:
                for dependent in dependents:
                    if dependent not in instance:
                        yield ValidationError(
                            f"{dependent!r} is required when {name!r} is present",
                            path,
                            "dependentRequired",
                        )

        properties = schema.get("properties", {})
        for name, subschema in properties.items():
            if name in instance:
                yield from self._errors(subschema, instance[name], base, [*path, name])

        additional = schema.get("additionalProperties")
        if additional is None:
            return
        for name in instance:
            if name in properties:
                continue
            if additional is False:
                yield ValidationError(
                    f"additional property {name!r} is not allowed", [*path, name], "additionalProperties"
                )
            elif additional is not True:
                yield from self._errors(additional, instance[name], base, [*path, name])
