"""Declared-vs-observed content-type agreement (INGF-02 deliverable 3 step 7; PRD §37.4).

PRD §37.4 requires "declared/observed type agreement". The observation is magic-byte sniffing of
the FIRST 512 BYTES ONLY — never more, so a mismatch aborts the transfer early rather than after a
document has been buffered. Sniffing here is a safety check, not parsing: `INGF-06` owns real format
handling, and this module deliberately recognises only enough to catch a source that returned an
error page, a consent wall or an unexpected archive.

THE EQUIVALENCE TABLE IS SMALL AND DOCUMENTED, as deliverable 3 requires. Anything outside it is a
mismatch. `application/octet-stream` is the one flexible case: it is what a badly configured server
sends for everything, so it is accepted when the sniff matches a type the caller said it expected
(`FetchValidators.expected_content_types`), and — when the caller expected nothing in particular —
when the sniff produced anything at all, since there is then nothing for it to disagree with.
"""

from __future__ import annotations

from typing import Mapping, Sequence

from ..adapter.failures import FailureCode

__all__ = ["EQUIVALENT", "OCTET_STREAM", "SNIFF_PREFIX_BYTES", "check_type", "parse_media_type", "sniff"]

#: Never buffer more than this to decide (deliverable 3 step 7).
SNIFF_PREFIX_BYTES = 512

OCTET_STREAM = "application/octet-stream"

#: declared media type -> the observed media types that are considered the same thing.
EQUIVALENT: Mapping[str, frozenset[str]] = {
    "text/plain": frozenset({"text/html", "application/xml", "application/json", "text/csv"}),
    "text/html": frozenset({"text/plain", "application/xhtml+xml", "application/xml"}),
    "application/xhtml+xml": frozenset({"text/html", "application/xml", "text/plain"}),
    "application/xml": frozenset({"text/xml", "application/xhtml+xml", "text/html", "text/plain"}),
    "text/xml": frozenset({"application/xml", "application/xhtml+xml", "text/plain"}),
    "application/json": frozenset({"text/plain", "text/json"}),
    "text/csv": frozenset({"text/plain"}),
    "application/zip": frozenset(
        {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
    ),
}

_BOMS = (b"\xef\xbb\xbf",)


def parse_media_type(declared: str | None) -> str:
    """Lowercase the media type and drop parameters (`; charset=utf-8`)."""
    if not declared:
        return OCTET_STREAM
    media = declared.split(";", 1)[0].strip().lower()
    if not media or "/" not in media:
        return OCTET_STREAM
    return media


def sniff(prefix: bytes) -> str | None:
    """The media type suggested by the magic bytes of *prefix*, or `None` when unrecognisable."""
    head = prefix[:SNIFF_PREFIX_BYTES]
    for bom in _BOMS:
        if head.startswith(bom):
            head = head[len(bom) :]
    if not head:
        return None
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x1f\x8b"):
        return "application/gzip"
    if head.startswith(b"PK\x03\x04") or head.startswith(b"PK\x05\x06"):
        return "application/zip"
    if head.startswith(b"{\\rtf"):
        return "application/rtf"
    stripped = head.lstrip(b" \t\r\n")
    lowered = stripped[:64].lower()
    if lowered.startswith(b"<?xml"):
        return "application/xml"
    if lowered.startswith(b"<!doctype html") or lowered.startswith(b"<html"):
        return "text/html"
    if stripped[:1] in (b"{", b"["):
        return "application/json"
    if stripped[:1] == b"<":
        return "application/xml"
    if b"\x00" in head:
        return None
    try:
        head.decode("utf-8")
    except UnicodeDecodeError:
        # A truncated multi-byte sequence at the 512-byte boundary is not evidence of anything.
        try:
            head[: max(0, len(head) - 3)].decode("utf-8")
        except UnicodeDecodeError:
            return None
    return "text/plain"


def check_type(
    declared: str | None,
    prefix: bytes,
    expected: Sequence[str] = (),
) -> FailureCode | None:
    """`FETCH_TYPE_MISMATCH` when the declared and observed types disagree, else `None`."""
    declared_media = parse_media_type(declared)
    observed = sniff(prefix)
    if observed is None:
        return None  # nothing observed: a mismatch cannot be asserted honestly

    expected_media = {parse_media_type(item) for item in expected}

    if declared_media == OCTET_STREAM:
        if not expected_media:
            return None
        if observed in expected_media or any(
            observed in EQUIVALENT.get(item, frozenset()) for item in expected_media
        ):
            return None
        return FailureCode("FETCH_TYPE_MISMATCH")

    if observed == declared_media:
        return None
    if observed in EQUIVALENT.get(declared_media, frozenset()):
        return None
    return FailureCode("FETCH_TYPE_MISMATCH")
