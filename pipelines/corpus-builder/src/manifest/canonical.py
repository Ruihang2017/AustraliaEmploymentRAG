"""Deterministic canonical serialisation of a manifest — the bytes that are hashed and signed.

CRPS-02 deliverable 6. The rules, in full, because a Rust verifier (RETR-01, RLSE-07) must
re-derive these bytes exactly:

1. The top-level members `signature` and `manifest_sha256` are REMOVED before serialising.
   Otherwise verification is circular: the digest would cover itself, and the signature would cover
   the signature.
2. Object keys are sorted ascending by Unicode code point.
3. No insignificant whitespace: `,` and `:` separate, nothing else.
4. UTF-8, and strings are emitted as-is (never `\\u`-escaped) except for the characters JSON
   requires to be escaped.
5. NO FLOAT MAY APPEAR. RFC 8785 serialises doubles with ECMAScript `Number::toString`, which
   Python's `repr` does not reproduce (`1e16` is `"10000000000000000"` in JavaScript and `"1e+16"`
   in Python; `1e-7` is `"1e-7"` and `"1e-07"`). A float in the signed form is a cross-language
   signature divergence waiting to happen, so `canonical_bytes()` raises `NonCanonicalValue`
   instead. Fractional values travel as decimal STRINGS — see the schema's `decimal` definition.
6. NO NON-ASCII OBJECT KEY. The ticket says "sorted by code point"; strict RFC 8785 sorts by UTF-16
   code unit, and the two orders differ for non-BMP keys. Rejecting non-ASCII keys makes the two
   orderings provably identical for every manifest this schema can express, which is a smaller and
   checkable promise than "we implement RFC 8785".

The serialiser is written out explicitly rather than delegating to `json.dumps(sort_keys=True)` so
that every rule above has its own error message and its own test.

Ordering constraint for callers: build -> canonicalise -> hash -> sign -> write. A manifest is never
mutated after `manifest_sha256` is set; the dataclasses are frozen, so that is true by construction.
"""

from __future__ import annotations

import hashlib
from typing import Any, Mapping

__all__ = [
    "CANONICAL_EXCLUDED",
    "NonCanonicalValue",
    "canonical_bytes",
    "canonical_json",
    "canonical_value",
    "manifest_sha256",
]

#: Top-level members removed from the canonical form. Excluding them is what makes verification
#: non-circular; the consequence is that `signature.signed_at` is UNAUTHENTICATED metadata.
CANONICAL_EXCLUDED: tuple[str, ...] = ("signature", "manifest_sha256")

_ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


class NonCanonicalValue(ValueError):
    """A value that cannot appear in a signed manifest (a float, a non-ASCII key, a foreign type)."""


def _escape(text: str) -> str:
    out = ['"']
    for char in text:
        escaped = _ESCAPES.get(char)
        if escaped is not None:
            out.append(escaped)
        elif ord(char) < 0x20:
            out.append(f"\\u{ord(char):04x}")
        else:
            out.append(char)
    out.append('"')
    return "".join(out)


def _emit(value: Any, out: list[str], pointer: str) -> None:
    # `bool` is a subclass of `int` in Python: dispatch on it FIRST, or `true` serialises as `1`.
    if value is None:
        out.append("null")
    elif value is True:
        out.append("true")
    elif value is False:
        out.append("false")
    elif isinstance(value, int):
        out.append(str(value))
    elif isinstance(value, float):
        raise NonCanonicalValue(
            f"{pointer or '/'}: a float ({value!r}) may never appear in a signed manifest — "
            "RFC 8785 number canonicalisation is not reproducible between Python and Rust. "
            "Carry fractional values as decimal strings (see the schema's `decimal` definition)."
        )
    elif isinstance(value, str):
        out.append(_escape(value))
    elif isinstance(value, Mapping):
        keys = list(value)
        for key in keys:
            if not isinstance(key, str):
                raise NonCanonicalValue(f"{pointer or '/'}: object key {key!r} is not a string")
            if not key.isascii():
                raise NonCanonicalValue(
                    f"{pointer or '/'}: object key {key!r} is not ASCII. Code-point ordering and "
                    "RFC 8785's UTF-16 ordering diverge outside the BMP, so the canonical form "
                    "admits ASCII keys only."
                )
        out.append("{")
        for index, key in enumerate(sorted(keys)):
            if index:
                out.append(",")
            out.append(_escape(key))
            out.append(":")
            _emit(value[key], out, f"{pointer}/{key}")
        out.append("}")
    elif isinstance(value, (list, tuple)):
        out.append("[")
        for index, item in enumerate(value):
            if index:
                out.append(",")
            _emit(item, out, f"{pointer}/{index}")
        out.append("]")
    else:
        raise NonCanonicalValue(
            f"{pointer or '/'}: {type(value).__name__} is not a JSON type; the canonical form "
            "admits null, bool, int, str, object and array only"
        )


def canonical_value(value: Any) -> str:
    """Canonicalise ANY JSON value under the same rules, with no member excluded.

    Used where a manifest *member* (not the manifest) is serialised — for example the JSON columns
    of `corpus_release`. Keeping one serialiser is the point: a second implementation is a second
    chance to diverge from what was signed.
    """
    out: list[str] = []
    _emit(value, out, "")
    return "".join(out)


def canonical_json(manifest: Mapping[str, Any]) -> str:
    """The canonical text form of *manifest* (the two excluded members removed)."""
    if not isinstance(manifest, Mapping):
        raise NonCanonicalValue(f"a manifest must be a JSON object, got {type(manifest).__name__}")
    body = {key: value for key, value in manifest.items() if key not in CANONICAL_EXCLUDED}
    out: list[str] = []
    _emit(body, out, "")
    return "".join(out)


def canonical_bytes(manifest: Mapping[str, Any]) -> bytes:
    """The exact bytes that are hashed and signed."""
    return canonical_json(manifest).encode("utf-8")


def manifest_sha256(manifest: Mapping[str, Any]) -> str:
    """Lowercase hex SHA-256 over `canonical_bytes(manifest)` — corpus_release.manifest_sha256."""
    return hashlib.sha256(canonical_bytes(manifest)).hexdigest()
