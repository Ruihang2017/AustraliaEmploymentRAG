"""The fetch area's failure codes (INGF-02 deliverable 7; ADM-001, PRD §40.8 item 10, §12.2).

Every code carries the action an operator must take — that is ADM-001's requirement and INGF-01's
`register_failure_codes()` rejects a blank one. Registration happens once, at import of
`taxrag_pipeline_ingestion.fetch`, not lazily at first failure: a code that only appears after
something has already gone wrong is useless to the operator console that enumerates the registry.

**These strings are append-only from merge.** `INGF-05` (quarantine), `INGF-08` (scheduling),
`INGF-09` and `INTL-03` consume them; renaming or removing one is a compatibility event for all
four. Adding a code is additive and safe.
"""

from __future__ import annotations

from typing import Mapping

from ..adapter.failures import FailureCode, register_failure_codes

__all__ = ["FETCH_AREA", "FETCH_FAILURE_CODES", "register_fetch_failure_codes"]

#: The registry area these codes belong to.
FETCH_AREA = "fetch"

#: The 14 codes of deliverable 7, each mapped to its operator action (ADM-001).
FETCH_FAILURE_CODES: Mapping[FailureCode, str] = {
    FailureCode("FETCH_DENIED_SCHEME"): (
        "The URL scheme is not https. Correct the source URL, or record the source as HTTP-only in "
        "its registry.yaml (PRD §21.1 forbids an insecure escape hatch)."
    ),
    FailureCode("FETCH_DENIED_HOST"): (
        "The host is not in the group's allowlist.yaml. If the host is legitimate, add it to that "
        "adapter's allowlist.yaml in a reviewed change; never widen the allowlist at run time."
    ),
    FailureCode("FETCH_DENIED_PATH"): (
        "The path is outside the group's path_prefixes, or matched deny_paths. Adjust the "
        "adapter's discovery, or extend path_prefixes in a reviewed change."
    ),
    FailureCode("FETCH_DENIED_IP"): (
        "The host resolved only to denied addresses (loopback, private, link-local, multicast, "
        "unspecified/broadcast/reserved, or a cloud-metadata address). Treat this as a possible "
        "SSRF attempt or DNS compromise: check the source's DNS and escalate; never bypass."
    ),
    FailureCode("FETCH_DENIED_DNS_UNRESOLVED"): (
        "DNS resolution returned no address for the host. Check the source's DNS and the runner's "
        "resolver, then retry the run; the source may have been withdrawn."
    ),
    FailureCode("FETCH_REDIRECT_DENIED"): (
        "A redirect pointed outside the group's allowlist and was refused before any request was "
        "sent to it. Verify the source's redirect target and, if legitimate, add it to that "
        "adapter's allowlist.yaml in a reviewed change."
    ),
    FailureCode("FETCH_REDIRECT_LIMIT"): (
        "The redirect chain exceeded MAX_REDIRECTS. Check for a redirect loop at the source; "
        "raising the limit is a PRD §45.5 configuration change, not an operator action."
    ),
    FailureCode("FETCH_TIMEOUT"): (
        "The fetch exceeded its total time budget. Re-run when the source recovers; if the source "
        "is persistently slow, record it as a source limitation rather than raising the budget."
    ),
    FailureCode("FETCH_SIZE_LIMIT"): (
        "The response exceeded the effective byte ceiling and the transfer was aborted. For a "
        "genuine official bulk artifact, set approved_max_bytes plus approved_max_bytes_reason in "
        "that group's allowlist.yaml (PRD §37.4); never raise MAX_DOCUMENT_BYTES."
    ),
    FailureCode("FETCH_DECOMPRESSION_LIMIT"): (
        "The transport-decompressed stream exceeded the decompressed ceiling or the compression "
        "ratio guard, and was aborted mid-stream. Treat as a possible decompression bomb (SEC-002): "
        "quarantine the artifact and inspect the source before retrying."
    ),
    FailureCode("FETCH_TYPE_MISMATCH"): (
        "The declared Content-Type disagreed with the observed magic bytes. Inspect the source: it "
        "may have returned an error or consent page instead of the document; correct the adapter's "
        "expected_content_types if the source legitimately changed format."
    ),
    FailureCode("FETCH_TLS_ERROR"): (
        "TLS verification failed (certificate, hostname or protocol). Do not disable verification. "
        "Report the broken chain to the source and record the group as SOURCE_UNAVAILABLE or a "
        "limited state until it is fixed (PRD §7, INGF-07)."
    ),
    FailureCode("FETCH_HTTP_ERROR"): (
        "The source returned an HTTP error, or a malformed/unsupported response, that retrying "
        "cannot fix. Inspect the status code in the failure details and the source's own status "
        "page; a persistent 4xx usually means the adapter's URL construction is stale."
    ),
    FailureCode("FETCH_TRANSIENT_FAILURE"): (
        "Every permitted attempt failed on a transient condition (connection error, timeout, or "
        "429/502/503/504). Re-run the group later; if it persists, check the source's status and "
        "the politeness settings in its allowlist.yaml."
    ),
}


def register_fetch_failure_codes() -> None:
    """Register the fetch codes with INGF-01's registry. Idempotent for an identical definition."""
    register_failure_codes(FETCH_AREA, FETCH_FAILURE_CODES)
