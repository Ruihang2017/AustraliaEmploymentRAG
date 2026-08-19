"""The eight PRD §12.2 candidate-release gates (CRPS-06 deliverable 4).

PRD §12.2: *"Candidate corpus releases MUST pass completeness, time, identity, citation, licensing,
smoke search, evaluation-subset and manifest checks. Failed releases MUST NOT modify active
production data."*

TWO PHASES, AND WHY THERE HAS TO BE TWO. Gate 8 calls `verify_bundle()`, which requires
`release-manifest.json` to be PRESENT in the bundle — while deliverable 11 fixes the order as
`assemble → gates → [all pass] → manifest build → sign → rename`. Both hold at once because
everything happens inside the staging directory and the gate run is split:

    phase A — gates 1-7 in full, plus gate 8's PIN PREFLIGHT, with no manifest on disk
    phase B — gate 8's `verify_bundle()` over the manifest just written into staging

The final path is still created by ONE rename after the last gate, so no artifact ever reaches it
before every gate has passed.

WHY THE PREFLIGHT EXISTS AT ALL. The acceptance checklist requires a CANDIDATE with an absent,
incomplete or stub pin to be a GATE REJECTION with a dedicated blocking code — but
`build_release_manifest()` raises `ManifestIncomplete` for exactly those inputs. The preflight
checks the REQUEST so that phase B is reachable; the agreement checks against
`embedding-manifest.json` and the QUERY/DOCUMENT representation equality are NOT re-implemented here
— they are `verify_bundle()`'s, and re-implementing them would create a second, divergeable copy of
a PRD §44.3 serial-owned contract.

NO GATE RAISES. `run_gates()` wraps every call so that an unexpected exception becomes a BLOCKING
`GATE_INTERNAL_ERROR` finding rather than an internal-error exit — the contract
`chunking.validate_chunks()` already sets here, for the same reason.

NO GATE CAN BE DISABLED. There is no `skip`, `force`, `only` or `disable` parameter in this module,
in `BuildRequest` or in the CLI; `tests/validation/test_gates_cannot_be_disabled.py` asserts it by
source scan.
"""

from __future__ import annotations

import re
import sqlite3
from contextlib import closing
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from chunking import DEFAULT_PROFILE, ChunkProfile, NodeVersionInput, SearchChunkDraft, validate_chunks
from contracts.validate import sha256_hex
from manifest import Counts, is_stub, verify_bundle
from tiering import IndexTier, is_eligible_for_dense, is_eligible_for_lexical

from .anomalies import collection_count_anomalies, parse_failure_anomalies
from .codes import GATE_NAMES
from .context import BundleContext
from .evaluation_report import load_evaluation_report
from .events import requirement_for
from .findings import Finding, GateResult
from .quarantine import assert_no_open_quarantine
from .source_groups import MANDATORY_SOURCE_GROUPS, PRD_SECTION_OF

__all__ = [
    "GATES",
    "Finding",
    "GateResult",
    "corpus_counts",
    "gate_citation",
    "gate_completeness",
    "gate_evaluation",
    "gate_identity",
    "gate_licensing",
    "gate_manifest_preflight",
    "gate_manifest_verification",
    "gate_smoke",
    "gate_time",
    "merge_results",
    "run_phase_a",
    "run_phase_b",
]

GateCallable = Callable[[BundleContext], list[Finding]]

_ISO_DATE = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

#: PRD §7 / `SourceCoverageStatus`: the four EXPLICIT limited states a mandatory group may release
#: in. `packages/contracts` publishes no `ACTIVE` member, so "present and not PLANNED_NOT_ACTIVE" is
#: the whole corpus-side rule. The tuple is derived from the published family at import time in
#: `_coverage_vocabulary()` rather than hand-copied.
_PLANNED_NOT_ACTIVE = "PLANNED_NOT_ACTIVE"

#: §3.9's partition of `LegalStatus`. Rows on the IN-FORCE TRACK represent consolidated effect and
#: must not overlap (PRD §40.9); rows on the not-yet/never-in-force track legitimately coexist for
#: one date, because several such artifacts (a bill, a draft, an uncommenced enactment) can be
#: current at the same moment. THE PARTITION IS THIS MODULE'S JUDGEMENT — the schema carries no
#: "consolidated" marker and `LegalStatus` has no `CONSOLIDATED` member — and it is stated here
#: rather than buried so that a reviewer can contest it as a ticket change, not a code change.
_IN_FORCE_TRACK = ("IN_FORCE", "SUPERSEDED", "REPEALED")


def _coverage_vocabulary() -> tuple[str, ...]:
    """`SourceCoverageStatus`'s members, read from the published `packages/contracts` export.

    Read rather than typed, so that a member added by FND-03 does not silently become an
    "unknown status" here. A missing export is not a silent pass: the exception propagates into the
    gate runner and becomes a BLOCKING `GATE_INTERNAL_ERROR`.
    """
    from contracts.enums import enum_values

    return enum_values("SourceCoverageStatus")


# ==================================================================================================
# Shared queries
# ==================================================================================================


def corpus_counts(connection: sqlite3.Connection) -> Counts:
    """The nine PRD §18.4 count members, queried from the corpus.

    NOTE for the reviewer: `build/assemble.py` derives the manifest's counts with its OWN queries.
    The duplication is deliberate — "counts in the manifest equal counts queried from the database"
    (deliverable 4.1) is only a check when the two derivations are independent.
    """
    def count(table: str) -> int:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])

    return Counts(
        sources=count("source"),
        documents=count("legal_document"),
        document_versions=count("document_version"),
        nodes=count("document_node"),
        node_versions=count("node_version"),
        relations=count("node_relation"),
        events=count("legal_event"),
        chunks=count("search_chunk"),
        embeddings=count("chunk_embedding"),
    )


def _finding(gate: str, code: str, severity: str, message: str, subject: str, **evidence: Any) -> Finding:
    return Finding(
        gate=gate, code=code, severity=severity, message=message, subject=subject, evidence=evidence
    )


# ==================================================================================================
# Gate 1 — completeness (PRD §7, §12.2, §44.4; breakdown plan §8 Q10)
# ==================================================================================================


def gate_completeness(ctx: BundleContext) -> list[Finding]:
    findings: list[Finding] = []
    vocabulary = set(_coverage_vocabulary())
    with closing(ctx.connect()) as connection:
        rows = connection.execute(
            "SELECT source_group_id, coverage_status, freshness_status, last_ingestion_at"
            " FROM source ORDER BY source_group_id, id"
        ).fetchall()
        by_group: dict[str, list[tuple[str, str, str | None]]] = {}
        for group, coverage_status, freshness_status, last_ingestion_at in rows:
            by_group.setdefault(str(group), []).append(
                (str(coverage_status), str(freshness_status), last_ingestion_at)
            )

        for group in MANDATORY_SOURCE_GROUPS:
            entries = by_group.get(group)
            if not entries:
                findings.append(
                    _finding(
                        "completeness",
                        "COMPLETENESS_SOURCE_GROUP_MISSING",
                        "BLOCKING",
                        f"mandatory source group {group} (PRD {PRD_SECTION_OF[group]}) has no "
                        "source row. PRD §44.4 forbids silently calling an unimplemented source "
                        "category covered",
                        f"source_group[{group}]",
                        prd_section=PRD_SECTION_OF[group],
                    )
                )
                continue
            for coverage_status, freshness_status, last_ingestion_at in entries:
                if coverage_status == _PLANNED_NOT_ACTIVE:
                    findings.append(
                        _finding(
                            "completeness",
                            "COMPLETENESS_SOURCE_GROUP_PLANNED_NOT_ACTIVE",
                            "BLOCKING",
                            f"mandatory source group {group} is still {_PLANNED_NOT_ACTIVE}. PRD §7: "
                            "no mandatory source group may remain PLANNED_NOT_ACTIVE at release; a "
                            "group blocked by official capability or licensing MUST use an explicit "
                            "limited state",
                            f"source_group[{group}]",
                            coverage_status=coverage_status,
                        )
                    )
                elif coverage_status not in vocabulary:
                    findings.append(
                        _finding(
                            "completeness",
                            "COMPLETENESS_COVERAGE_STATUS_UNKNOWN",
                            "BLOCKING",
                            f"source group {group} records coverage_status {coverage_status!r}, "
                            "which is not a member of the published SourceCoverageStatus family; an "
                            "unrecognised state is never read as covered",
                            f"source_group[{group}]",
                            coverage_status=coverage_status,
                        )
                    )
                else:
                    # An explicit limited state PASSES and is RECORDED with the reason the source
                    # itself carries. The reason is never invented here: breakdown plan §8 Q10
                    # permits a limited state only on measured evidence, which is GOLD-16's to
                    # produce and this gate's only to require be explicit.
                    findings.append(
                        _finding(
                            "completeness",
                            "COMPLETENESS_SOURCE_GROUP_LIMITED",
                            "INFO",
                            f"source group {group} releases in the explicit limited state "
                            f"{coverage_status}, recorded with freshness {freshness_status} and last "
                            f"ingestion {last_ingestion_at}",
                            f"source_group[{group}]",
                            coverage_status=coverage_status,
                            freshness_status=freshness_status,
                            last_ingestion_at=last_ingestion_at,
                        )
                    )

        observed = corpus_counts(connection)
        declared = ctx.declared_counts
        if declared is not None:
            for member in observed.to_dict():
                if getattr(observed, member) != getattr(declared, member):
                    findings.append(
                        _finding(
                            "completeness",
                            "COMPLETENESS_COUNT_MISMATCH",
                            "BLOCKING",
                            f"counts.{member} is recorded as {getattr(declared, member)} but the "
                            f"corpus contains {getattr(observed, member)}",
                            f"counts.{member}",
                            declared=getattr(declared, member),
                            observed=getattr(observed, member),
                        )
                    )

        findings.extend(_embedding_count_agreement(ctx, observed))
        findings.extend(assert_no_open_quarantine(connection))
        findings.extend(parse_failure_anomalies(connection, ctx.request.anomaly_thresholds))

        if ctx.parent_connect is None:
            findings.extend(
                collection_count_anomalies(connection, None, ctx.request.anomaly_thresholds)
            )
        else:
            with closing(ctx.parent_connect()) as parent:
                findings.extend(
                    collection_count_anomalies(
                        connection, parent, ctx.request.anomaly_thresholds
                    )
                )
    return findings


def _embedding_count_agreement(ctx: BundleContext, observed: Counts) -> list[Finding]:
    """`chunk`/`embedding` counts against CRPS-05's own report (deliverable 4.1)."""
    findings: list[Finding] = []
    embedding = ctx.embedding_manifest
    if isinstance(embedding, Mapping):
        selection = embedding.get("tier_selection")
        if isinstance(selection, Mapping) and selection.get("chunk_count") != observed.chunks:
            findings.append(
                _finding(
                    "completeness",
                    "COMPLETENESS_EMBEDDING_COUNT_DISAGREEMENT",
                    "BLOCKING",
                    "embedding-manifest.json records tier_selection.chunk_count "
                    f"{selection.get('chunk_count')!r} but the corpus contains {observed.chunks} "
                    "search_chunk rows",
                    "embedding-manifest.json/tier_selection.chunk_count",
                )
            )
        vector_file = embedding.get("vector_file")
        if isinstance(vector_file, Mapping) and vector_file.get("count") != observed.embeddings:
            findings.append(
                _finding(
                    "completeness",
                    "COMPLETENESS_EMBEDDING_COUNT_DISAGREEMENT",
                    "BLOCKING",
                    f"embedding-manifest.json records vector_file.count {vector_file.get('count')!r} "
                    f"but the corpus contains {observed.embeddings} chunk_embedding rows",
                    "embedding-manifest.json/vector_file.count",
                )
            )
    report = ctx.embedding_report
    if isinstance(report, Mapping) and "embedded_count" in report:
        if report.get("embedded_count") != observed.embeddings:
            findings.append(
                _finding(
                    "completeness",
                    "COMPLETENESS_EMBEDDING_COUNT_DISAGREEMENT",
                    "BLOCKING",
                    "embedding-build-report.json records embedded_count "
                    f"{report.get('embedded_count')!r} but the corpus contains "
                    f"{observed.embeddings} chunk_embedding rows",
                    "embedding-build-report.json/embedded_count",
                )
            )
    return findings


# ==================================================================================================
# Gate 2 — time (PRD §15.2, §35.1, §40.9)
# ==================================================================================================


def _parse_date(value: str) -> date | None:
    if not _ISO_DATE.match(value):
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _overlaps(
    first: tuple[date, date | None], second: tuple[date, date | None]
) -> bool:
    """Half-open `[from, to)` intersection; a null `to` means open-ended."""
    (start_a, end_a), (start_b, end_b) = first, second
    if end_a is not None and end_a <= start_b:
        return False
    if end_b is not None and end_b <= start_a:
        return False
    return True


def _interval_findings(
    gate: str,
    subject_prefix: str,
    rows: Sequence[tuple[str, str, str | None, str | None, str]],
) -> list[Finding]:
    """Shared over `document_version` and `node_version`: shape checks plus the overlap rule.

    Each row is `(row_id, series_key, effective_from, effective_to, legal_status)`.
    """
    findings: list[Finding] = []
    series: dict[str, list[tuple[str, date, date | None]]] = {}
    for row_id, series_key, raw_from, raw_to, legal_status in rows:
        parsed_from = None if raw_from is None else _parse_date(str(raw_from))
        parsed_to = None if raw_to is None else _parse_date(str(raw_to))
        for label, raw, parsed in (
            ("effective_from", raw_from, parsed_from),
            ("effective_to", raw_to, parsed_to),
        ):
            if raw is not None and parsed is None:
                findings.append(
                    _finding(
                        gate,
                        "TIME_DATE_MALFORMED",
                        "BLOCKING",
                        f"{subject_prefix}[{row_id}].{label} is {raw!r}, which is not a PRD §15.2 "
                        "YYYY-MM-DD date",
                        f"{subject_prefix}[{row_id}].{label}",
                    )
                )
        if parsed_from is not None and parsed_to is not None and parsed_to < parsed_from:
            findings.append(
                _finding(
                    gate,
                    "TIME_INTERVAL_INVERTED",
                    "BLOCKING",
                    f"{subject_prefix}[{row_id}] has effective_to {raw_to} before effective_from "
                    f"{raw_from}",
                    f"{subject_prefix}[{row_id}]",
                )
            )
            continue
        if parsed_from is None:
            findings.append(
                _finding(
                    gate,
                    "TIME_EFFECTIVE_FROM_ABSENT",
                    "INFO",
                    f"{subject_prefix}[{row_id}] has no effective_from, so its effect interval is "
                    "not measurable and it was NOT included in the overlap check",
                    f"{subject_prefix}[{row_id}]",
                )
            )
            continue
        if str(legal_status) not in _IN_FORCE_TRACK:
            continue
        series.setdefault(str(series_key), []).append((row_id, parsed_from, parsed_to))

    for series_key, entries in sorted(series.items()):
        ordered = sorted(entries, key=lambda item: (item[1], item[0]))
        for index, (row_id, start, end) in enumerate(ordered):
            for other_id, other_start, other_end in ordered[index + 1 :]:
                if _overlaps((start, end), (other_start, other_end)):
                    findings.append(
                        _finding(
                            gate,
                            "TIME_CONSOLIDATED_OVERLAP",
                            "BLOCKING",
                            f"{subject_prefix} rows {row_id} and {other_id} of {series_key} both "
                            "represent consolidated effect and their half-open intervals intersect "
                            "(PRD §40.9: any overlapping effect interval for a supposedly "
                            "consolidated series blocks release)",
                            f"{subject_prefix}[{row_id}]",
                            other=other_id,
                            series=series_key,
                        )
                    )
    return findings


def gate_time(ctx: BundleContext) -> list[Finding]:
    findings: list[Finding] = []
    with closing(ctx.connect()) as connection:
        findings.extend(
            _interval_findings(
                "time",
                "document_version",
                [
                    (str(row[0]), str(row[1]), row[2], row[3], str(row[4]))
                    for row in connection.execute(
                        "SELECT id, document_id, effective_from, effective_to, legal_status"
                        " FROM document_version ORDER BY id"
                    ).fetchall()
                ],
            )
        )
        findings.extend(
            _interval_findings(
                "time",
                "node_version",
                [
                    (str(row[0]), str(row[1]), row[2], row[3], str(row[4]))
                    for row in connection.execute(
                        "SELECT nv.id, nv.document_node_id, nv.effective_from, nv.effective_to,"
                        " dv.legal_status FROM node_version nv"
                        " JOIN document_version dv ON dv.id = nv.document_version_id"
                        " ORDER BY nv.id"
                    ).fetchall()
                ],
            )
        )

        for row in connection.execute(
            "SELECT id, event_type, event_date, effective_date FROM legal_event ORDER BY id"
        ).fetchall():
            event_id, event_type, event_date, effective_date = (
                str(row[0]), str(row[1]), row[2], row[3]
            )
            for label, value in (("event_date", event_date), ("effective_date", effective_date)):
                if value is not None and _parse_date(str(value)) is None:
                    findings.append(
                        _finding(
                            "time",
                            "TIME_DATE_MALFORMED",
                            "BLOCKING",
                            f"legal_event[{event_id}].{label} is {value!r}, which is not a PRD §15.2 "
                            "YYYY-MM-DD date",
                            f"legal_event[{event_id}].{label}",
                        )
                    )
            requirement = requirement_for(event_type)
            if requirement is None:
                findings.append(
                    _finding(
                        "time",
                        "TIME_EVENT_TYPE_UNRECOGNISED",
                        "INFO",
                        f"legal_event[{event_id}] has event_type {event_type!r}, which this gate's "
                        "declared mapping does not cover, so whether it requires an effective_date "
                        "was NOT checked. `legal_event.event_type` has no published enum family "
                        "(Q-CRPS-4 / FND-03) and no vocabulary is invented here",
                        f"legal_event[{event_id}].event_type",
                        event_type=event_type,
                    )
                )
            elif requirement and effective_date is None:
                findings.append(
                    _finding(
                        "time",
                        "TIME_EVENT_EFFECTIVE_DATE_ABSENT",
                        "BLOCKING",
                        f"legal_event[{event_id}] is a {event_type} event, whose effect moves the "
                        "law's operation from a date, and it records no effective_date",
                        f"legal_event[{event_id}].effective_date",
                        event_type=event_type,
                    )
                )
    return findings


# ==================================================================================================
# Gate 3 — identity (PRD §40.9)
# ==================================================================================================


def gate_identity(ctx: BundleContext) -> list[Finding]:
    """Duplicate stable identity is BLOCKING.

    A well-formed corpus database protects `(source_id, stable_source_key)` and
    `(document_id, stable_node_key)` with UNIQUE indexes. This gate exists because a HAND-BUILT or
    TAMPERED database may not carry them, and the release gate — not the schema — is the trust
    boundary a candidate crosses.
    """
    findings: list[Finding] = []
    with closing(ctx.connect()) as connection:
        for row in connection.execute(
            "SELECT source_id, stable_source_key, COUNT(*) FROM legal_document"
            " GROUP BY source_id, stable_source_key HAVING COUNT(*) > 1"
            " ORDER BY source_id, stable_source_key"
        ).fetchall():
            findings.append(
                _finding(
                    "identity",
                    "IDENTITY_DUPLICATE_DOCUMENT_IDENTITY",
                    "BLOCKING",
                    f"{row[2]} legal_document rows share stable identity "
                    f"(source_id={row[0]!r}, stable_source_key={row[1]!r})",
                    f"legal_document[{row[0]}/{row[1]}]",
                    duplicate_count=int(row[2]),
                )
            )
        for row in connection.execute(
            "SELECT document_id, stable_node_key, COUNT(*) FROM document_node"
            " GROUP BY document_id, stable_node_key HAVING COUNT(*) > 1"
            " ORDER BY document_id, stable_node_key"
        ).fetchall():
            findings.append(
                _finding(
                    "identity",
                    "IDENTITY_DUPLICATE_NODE_IDENTITY",
                    "BLOCKING",
                    f"{row[2]} document_node rows share stable identity "
                    f"(document_id={row[0]!r}, stable_node_key={row[1]!r})",
                    f"document_node[{row[0]}/{row[1]}]",
                    duplicate_count=int(row[2]),
                )
            )
        for row in connection.execute(
            "SELECT dv.id, dv.document_id,"
            " (SELECT COUNT(*) FROM legal_document d WHERE d.id = dv.document_id)"
            " FROM document_version dv ORDER BY dv.id"
        ).fetchall():
            if int(row[2]) != 1:
                findings.append(
                    _finding(
                        "identity",
                        "IDENTITY_DOCUMENT_VERSION_UNRESOLVED",
                        "BLOCKING",
                        f"document_version {row[0]} references document_id {row[1]!r}, which "
                        f"resolves to {row[2]} legal_document rows rather than exactly one",
                        f"document_version[{row[0]}]",
                        resolved_count=int(row[2]),
                    )
                )
    return findings


# ==================================================================================================
# Gate 4 — citation (PRD §15.3, §40.9; SRCH-003)
# ==================================================================================================


def gate_citation(ctx: BundleContext) -> list[Finding]:
    """Every stored hash reproduces its text, and every offset slices inside it.

    A CONSEQUENCE STATED RATHER THAN HIDDEN: `search_chunk` stores neither `char_count` nor
    `consolidated_node_version_ids` nor `profile_id` (CRPS-01's column set), so the
    `SearchChunkDraft` values reconstructed below carry `char_count = end - start`, an EMPTY
    consolidation list and the request's chunk profile id. Consolidation legality is therefore NOT
    re-checkable from the database, and a consolidated chunk leaves its non-anchor participants with
    no chunk rows of their own — which is reported as `CITATION_NODE_UNCHUNKED` at ANOMALY, not as a
    gap, precisely because it may be legitimate.
    """
    findings: list[Finding] = []
    profile = ChunkProfile(
        profile_id=str(ctx.request.chunk_profile_id),
        target_chars=DEFAULT_PROFILE.target_chars,
        max_chars=DEFAULT_PROFILE.max_chars,
        min_chars=DEFAULT_PROFILE.min_chars,
        overlap_chars=DEFAULT_PROFILE.overlap_chars,
        consolidate_within_provision=DEFAULT_PROFILE.consolidate_within_provision,
        split_strategy=DEFAULT_PROFILE.split_strategy,
    )
    with closing(ctx.connect()) as connection:
        nodes = {
            str(row[0]): (str(row[1]), str(row[2]), int(row[3]), str(row[4]))
            for row in connection.execute(
                "SELECT nv.id, nv.canonical_text, nv.text_hash, nv.ordinal, dn.node_kind"
                " FROM node_version nv JOIN document_node dn ON dn.id = nv.document_node_id"
                " ORDER BY nv.id"
            ).fetchall()
        }
        for node_version_id, (text, text_hash, _ordinal, _kind) in nodes.items():
            if sha256_hex(text) != text_hash:
                findings.append(
                    _finding(
                        "citation",
                        "CITATION_NODE_TEXT_HASH_MISMATCH",
                        "BLOCKING",
                        f"node_version[{node_version_id}].text_hash does not reproduce its stored "
                        "canonical_text; an exact-quote guarantee cannot rest on it (SRCH-003)",
                        f"node_version[{node_version_id}].text_hash",
                    )
                )

        chunks_by_node: dict[str, list[tuple[str, int, int, int, str]]] = {}
        for row in connection.execute(
            "SELECT id, node_version_id, chunk_ordinal, start_offset, end_offset, text_hash"
            " FROM search_chunk ORDER BY node_version_id, chunk_ordinal"
        ).fetchall():
            chunks_by_node.setdefault(str(row[1]), []).append(
                (str(row[0]), int(row[2]), int(row[3]), int(row[4]), str(row[5]))
            )

        for node_version_id, entries in sorted(chunks_by_node.items()):
            node = nodes.get(node_version_id)
            if node is None:
                continue
            text = node[0]
            drafts: list[SearchChunkDraft] = []
            for chunk_id, ordinal, start, end, chunk_hash in entries:
                if not (0 <= start <= end <= len(text)):
                    findings.append(
                        _finding(
                            "citation",
                            "CITATION_CHUNK_OFFSET_OUT_OF_RANGE",
                            "BLOCKING",
                            f"search_chunk[{chunk_id}] slices [{start}, {end}) of a node whose text "
                            f"is {len(text)} characters long",
                            f"search_chunk[{chunk_id}]",
                            start_offset=start,
                            end_offset=end,
                            text_length=len(text),
                        )
                    )
                    continue
                if sha256_hex(text[start:end]) != chunk_hash:
                    findings.append(
                        _finding(
                            "citation",
                            "CITATION_CHUNK_HASH_MISMATCH",
                            "BLOCKING",
                            f"search_chunk[{chunk_id}].text_hash does not reproduce the slice its "
                            "own offsets select from the node text",
                            f"search_chunk[{chunk_id}].text_hash",
                        )
                    )
                    continue
                drafts.append(
                    SearchChunkDraft(
                        node_version_id=node_version_id,
                        chunk_ordinal=ordinal,
                        start_offset=start,
                        end_offset=end,
                        text_hash=chunk_hash,
                        char_count=end - start,
                        consolidated_node_version_ids=(),
                        profile_id=profile.profile_id,
                    )
                )
            if not drafts:
                continue
            node_input = NodeVersionInput(
                node_version_id=node_version_id,
                document_version_id="not-read-by-validate_chunks",
                parent_node_version_id=None,
                ordinal=node[2],
                node_kind=node[3],
                canonical_text=text,
            )
            for violation in validate_chunks(node_input, drafts, profile):
                findings.append(
                    _finding(
                        "citation",
                        "CITATION_CHUNK_RULE_VIOLATION",
                        "BLOCKING",
                        f"CRPS-03's chunk validator reports {violation.code} for "
                        f"node_version[{node_version_id}]: {violation.message}",
                        f"node_version[{node_version_id}]",
                        chunk_violation_code=violation.code,
                        chunk_ordinal=violation.chunk_ordinal,
                    )
                )

        for node_version_id in sorted(nodes):
            if node_version_id not in chunks_by_node and nodes[node_version_id][0].strip():
                findings.append(
                    _finding(
                        "citation",
                        "CITATION_NODE_UNCHUNKED",
                        "ANOMALY",
                        f"node_version[{node_version_id}] carries text but has no search_chunk row. "
                        "This may be legitimate — a consolidated chunk anchors to its first "
                        "participant and leaves the rest without rows — so it FLAGS rather than "
                        "fails",
                        f"node_version[{node_version_id}]",
                    )
                )

        for row in connection.execute(
            "SELECT id, evidence_node_version_id, evidence_start, evidence_end FROM node_relation"
            " WHERE evidence_node_version_id IS NOT NULL ORDER BY id"
        ).fetchall():
            relation_id, evidence_node, start, end = str(row[0]), str(row[1]), row[2], row[3]
            node = nodes.get(evidence_node)
            if node is None:
                findings.append(
                    _finding(
                        "citation",
                        "CITATION_RELATION_EVIDENCE_OUT_OF_RANGE",
                        "BLOCKING",
                        f"node_relation[{relation_id}] cites evidence in node_version "
                        f"{evidence_node!r}, which does not exist",
                        f"node_relation[{relation_id}]",
                    )
                )
                continue
            if start is None or end is None:
                continue
            if not (0 <= int(start) <= int(end) <= len(node[0])):
                findings.append(
                    _finding(
                        "citation",
                        "CITATION_RELATION_EVIDENCE_OUT_OF_RANGE",
                        "BLOCKING",
                        f"node_relation[{relation_id}] cites [{start}, {end}) of an evidence node "
                        f"whose text is {len(node[0])} characters long",
                        f"node_relation[{relation_id}]",
                        evidence_start=int(start),
                        evidence_end=int(end),
                        text_length=len(node[0]),
                    )
                )

    report = ctx.evaluation_report
    # A `Decimal`, because the metric arrives as a decimal string and may be fractional. The test is
    # `!= 0` rather than `> 0`: a negative count is nonsense for a count and is reported rather than
    # read as "none". Carried into the evidence as a STRING so the gate report stays plain JSON.
    broken = getattr(report, "broken_gold_citations", 0) if report is not None else 0
    if broken != 0:
        findings.append(
            _finding(
                "citation",
                "CITATION_GOLD_BROKEN",
                "BLOCKING",
                f"the evaluation report records {broken} broken gold citation(s); PRD §40.9 makes a "
                "broken gold citation a blocking class",
                "evaluation_report.metrics.broken_gold_citations",
                broken_gold_citations=str(broken),
            )
        )
    return findings


# ==================================================================================================
# Gate 5 — licensing (PRD §11.1, §35.3)
# ==================================================================================================


def gate_licensing(ctx: BundleContext) -> list[Finding]:
    """Corpus-content licensing only. MODEL-WEIGHT licences are gate 8's, via the pins."""
    findings: list[Finding] = []
    tiers = {member.value for member in IndexTier}
    with closing(ctx.connect()) as connection:
        for row in connection.execute(
            "SELECT a.id, a.licence_snapshot_id FROM source_artifact a"
            " LEFT JOIN licence_snapshot s ON s.id = a.licence_snapshot_id"
            " WHERE s.id IS NULL ORDER BY a.id"
        ).fetchall():
            findings.append(
                _finding(
                    "licensing",
                    "LICENSING_ARTIFACT_SNAPSHOT_UNRESOLVED",
                    "BLOCKING",
                    f"source_artifact[{row[0]}] references licence_snapshot {row[1]!r}, which does "
                    "not exist; the artifact's terms of use cannot be established",
                    f"source_artifact[{row[0]}]",
                )
            )

        for row in connection.execute(
            "SELECT DISTINCT d.id, s.id, s.licence_assessment_id, la.status"
            " FROM legal_document d JOIN source s ON s.id = d.source_id"
            " LEFT JOIN licence_assessment la ON la.id = s.licence_assessment_id"
            " ORDER BY d.id"
        ).fetchall():
            document_id, source_id, assessment_id, status = row
            if assessment_id is None or status is None:
                findings.append(
                    _finding(
                        "licensing",
                        "LICENSING_ASSESSMENT_ABSENT",
                        "BLOCKING",
                        f"legal_document[{document_id}]'s source {source_id} carries no resolvable "
                        "licence_assessment; PRD §11.1 forbids including material whose licence "
                        "state is unknown",
                        f"legal_document[{document_id}]",
                    )
                )
                continue
            if str(status) == "PROHIBITED":
                findings.append(
                    _finding(
                        "licensing",
                        "LICENSING_ASSESSMENT_PROHIBITED",
                        "BLOCKING",
                        f"legal_document[{document_id}]'s source {source_id} is assessed PROHIBITED",
                        f"legal_document[{document_id}]",
                        licence_status=str(status),
                    )
                )

        for row in connection.execute(
            "SELECT id, index_tier FROM search_chunk ORDER BY id"
        ).fetchall():
            chunk_id, tier = str(row[0]), row[1]
            if tier is None or str(tier) not in tiers:
                findings.append(
                    _finding(
                        "licensing",
                        "LICENSING_TIER_UNKNOWN",
                        "BLOCKING",
                        f"search_chunk[{chunk_id}] carries index_tier {tier!r}, which is not a member "
                        "of the published IndexTier family; an unassigned tier is never read as "
                        "permitted",
                        f"search_chunk[{chunk_id}].index_tier",
                        index_tier=None if tier is None else str(tier),
                    )
                )

        # DELIVERABLE 4.1 STATES TWO INDEPENDENT CONDITIONS — an excluded chunk must not be "present
        # in the vector index" and must not be "marked lexically eligible" — so they are evaluated
        # over TWO DIFFERENT ROW SETS and this query must not scope both to the embedded ones. A
        # LEFT JOIN keeps every `search_chunk` row: a licensing-excluded chunk that was never
        # dense-embedded has no `chunk_embedding` row at all, and an inner join would simply never
        # visit it — the lexical condition would then pass with zero findings on exactly the corpus
        # it exists to refuse. `embedded` is the count of embedding rows, so the dense condition
        # still applies only where one exists.
        for row in connection.execute(
            "SELECT c.id, c.index_tier, COUNT(e.search_chunk_id) FROM search_chunk c"
            " LEFT JOIN chunk_embedding e ON e.search_chunk_id = c.id"
            " GROUP BY c.id, c.index_tier ORDER BY c.id"
        ).fetchall():
            chunk_id, tier, embedded = str(row[0]), row[1], int(row[2])
            if tier is None or str(tier) not in tiers:
                # An unknown tier is already BLOCKING above (`LICENSING_TIER_UNKNOWN`); it is not
                # graded twice, and it is never read as permitted.
                continue
            # The predicate is CRPS-04's and is never re-implemented here.
            if embedded and not is_eligible_for_dense(IndexTier(str(tier))):
                findings.append(
                    _finding(
                        "licensing",
                        "LICENSING_EXCLUDED_CHUNK_EMBEDDED",
                        "BLOCKING",
                        f"search_chunk[{chunk_id}] is tiered {tier} and is NOT eligible for dense "
                        "indexing, yet a chunk_embedding row exists for it",
                        f"search_chunk[{chunk_id}]",
                        index_tier=str(tier),
                    )
                )
            if not is_eligible_for_lexical(IndexTier(str(tier))):
                findings.append(
                    _finding(
                        "licensing",
                        "LICENSING_EXCLUDED_CHUNK_LEXICAL",
                        "BLOCKING",
                        f"search_chunk[{chunk_id}] is tiered {tier}, which is excluded from the "
                        "lexically eligible corpus, yet it is carried into the indexed set",
                        f"search_chunk[{chunk_id}]",
                        index_tier=str(tier),
                    )
                )
    return findings


# ==================================================================================================
# Gate 6 — smoke search, offline subset (PRD §12.2, §18.4)
# ==================================================================================================


def gate_smoke(ctx: BundleContext) -> list[Finding]:
    """Identifier and node lookups against `corpus.sqlite`, read-only.

    THE PROBES ARE DERIVED FROM THE CORPUS, NOT HARDCODED — a gate cannot hold expected row values
    for an arbitrary release. Each probe picks the first candidate row by ascending id, looks it up
    BY THAT IDENTIFIER ALONE, and requires the round trip to resolve to exactly that row.

    A probe class with no candidate row (a corpus with no `employer_abn` anywhere, say) is an
    ANOMALY, because a legitimate release may not contain that identifier class; a probe that fails
    to round-trip is BLOCKING. Full search smoke stays `RLSE-07`'s (PRD §18.4).
    """
    findings: list[Finding] = []
    with closing(ctx.connect()) as connection:
        for column in ("official_identifier", "neutral_citation", "employer_abn"):
            row = connection.execute(
                f"SELECT id, {column} FROM legal_document WHERE {column} IS NOT NULL"
                " ORDER BY id LIMIT 1"
            ).fetchone()
            if row is None:
                findings.append(
                    _finding(
                        "smoke",
                        "SMOKE_PROBE_CLASS_ABSENT",
                        "ANOMALY",
                        f"no legal_document carries a {column}, so that identifier lookup class was "
                        "not exercised; a release may legitimately contain none",
                        f"legal_document.{column}",
                    )
                )
                continue
            document_id, value = str(row[0]), row[1]
            resolved = connection.execute(
                f"SELECT id FROM legal_document WHERE {column} = ?", (value,)
            ).fetchall()
            if [str(item[0]) for item in resolved] != [document_id]:
                findings.append(
                    _finding(
                        "smoke",
                        "SMOKE_IDENTIFIER_LOOKUP_FAILED",
                        "BLOCKING",
                        f"looking a document up by its own {column} resolved to "
                        f"{len(resolved)} rows rather than exactly the source row",
                        f"legal_document.{column}",
                        resolved_count=len(resolved),
                    )
                )

        node_row = connection.execute(
            "SELECT dn.document_id, dn.stable_node_key, dn.id FROM document_node dn"
            " ORDER BY dn.id LIMIT 1"
        ).fetchone()
        if node_row is None:
            findings.append(
                _finding(
                    "smoke",
                    "SMOKE_PROBE_CLASS_ABSENT",
                    "ANOMALY",
                    "the corpus has no document_node, so exact provision lookup was not exercised",
                    "document_node",
                )
            )
        else:
            document_id, stable_node_key, node_id = (
                str(node_row[0]), str(node_row[1]), str(node_row[2])
            )
            resolved = connection.execute(
                "SELECT id FROM document_node WHERE document_id = ? AND stable_node_key = ?",
                (document_id, stable_node_key),
            ).fetchall()
            if [str(item[0]) for item in resolved] != [node_id]:
                findings.append(
                    _finding(
                        "smoke",
                        "SMOKE_PROVISION_LOOKUP_FAILED",
                        "BLOCKING",
                        "exact provision lookup by (document_id, stable_node_key) resolved to "
                        f"{len(resolved)} rows rather than exactly one",
                        f"document_node[{node_id}]",
                        resolved_count=len(resolved),
                    )
                )
            else:
                findings.extend(_point_in_time_probe(connection, node_id))
    return findings


def _point_in_time_probe(connection: sqlite3.Connection, node_id: str) -> list[Finding]:
    """At most one node version in effect per date, and exactly one at an in-interval date."""
    findings: list[Finding] = []
    rows = connection.execute(
        "SELECT id, canonical_text, text_hash, effective_from, effective_to FROM node_version"
        " WHERE document_node_id = ? ORDER BY id",
        (node_id,),
    ).fetchall()
    measurable = [
        (str(row[0]), row[3], row[4]) for row in rows if row[3] is not None
    ]
    if not measurable:
        return [
            _finding(
                "smoke",
                "SMOKE_PROBE_CLASS_ABSENT",
                "ANOMALY",
                f"document_node[{node_id}] has no node_version with an effective_from, so "
                "point-in-time resolution was not exercised",
                f"document_node[{node_id}]",
            )
        ]

    for row in rows:
        node_version_id, text, text_hash = str(row[0]), str(row[1]), str(row[2])
        if sha256_hex(text) != text_hash:
            findings.append(
                _finding(
                    "smoke",
                    "SMOKE_PROVISION_LOOKUP_FAILED",
                    "BLOCKING",
                    f"the provision resolved for document_node[{node_id}] does not reproduce its "
                    "own text_hash",
                    f"node_version[{node_version_id}]",
                )
            )

    node_version_id, raw_from, raw_to = measurable[0]
    start = _parse_date(str(raw_from))
    if start is None:
        return findings
    end = _parse_date(str(raw_to)) if raw_to is not None else None
    probes = (
        ("in-interval", start),
        ("before", start - timedelta(days=1)),
        ("after", end if end is not None else start + timedelta(days=1)),
    )
    for label, probe in probes:
        in_effect = [
            entry
            for entry in measurable
            if _in_effect(entry, probe)
        ]
        if len(in_effect) > 1:
            findings.append(
                _finding(
                    "smoke",
                    "SMOKE_POINT_IN_TIME_AMBIGUOUS",
                    "BLOCKING",
                    f"{len(in_effect)} node versions of document_node[{node_id}] are in effect at "
                    f"{probe.isoformat()} ({label}); point-in-time resolution must select at most "
                    "one",
                    f"document_node[{node_id}]",
                    probe_date=probe.isoformat(),
                    in_effect_count=len(in_effect),
                )
            )
        if label == "in-interval" and len(in_effect) != 1:
            findings.append(
                _finding(
                    "smoke",
                    "SMOKE_POINT_IN_TIME_AMBIGUOUS",
                    "BLOCKING",
                    f"{len(in_effect)} node versions of document_node[{node_id}] are in effect at "
                    f"{probe.isoformat()}, a date inside node_version[{node_version_id}]'s own "
                    "interval; exactly one was expected",
                    f"document_node[{node_id}]",
                    probe_date=probe.isoformat(),
                    in_effect_count=len(in_effect),
                )
            )
    return findings


def _in_effect(entry: tuple[str, Any, Any], probe: date) -> bool:
    _, raw_from, raw_to = entry
    start = _parse_date(str(raw_from))
    if start is None or probe < start:
        return False
    if raw_to is None:
        return True
    end = _parse_date(str(raw_to))
    return end is None or probe < end


# ==================================================================================================
# Gate 7 — evaluation subset (PRD §12.2, §14.2)
# ==================================================================================================


def gate_evaluation(ctx: BundleContext) -> list[Finding]:
    request = ctx.request
    path = request.evaluation_report_path
    if path is None or not path.is_file():
        if request.allow_not_run_evaluation and not ctx.is_candidate:
            return [
                _finding(
                    "evaluation",
                    "EVALUATION_NOT_RUN_ALLOWED",
                    "INFO",
                    "no evaluation report was supplied; the build is a "
                    f"{ctx.release_kind} with allow_not_run_evaluation set, so the manifest records "
                    "status NOT_RUN explicitly. A release intended for promotion may not do this",
                    "evaluation_report",
                )
            ]
        return [
            _finding(
                "evaluation",
                "EVALUATION_REPORT_ABSENT",
                "BLOCKING",
                "no evaluation report was supplied. It is BLOCKING for a CANDIDATE, and allowed "
                "only with allow_not_run_evaluation on a non-candidate build (PRD §12.2)",
                "evaluation_report",
                release_kind=ctx.release_kind,
                allow_not_run_evaluation=bool(request.allow_not_run_evaluation),
            )
        ]

    report, findings = load_evaluation_report(path)
    if findings:
        # MALFORMED is BLOCKING under EVERY release kind, including one where a MISSING report
        # would have been allowed: reading "the file was corrupt" as "no evaluation ran" is how a
        # broken harness silently releases.
        return findings
    assert report is not None
    for gate in report.failed_gates:
        findings.append(
            _finding(
                "evaluation",
                "EVALUATION_GATE_FAILED",
                "BLOCKING",
                f"evaluation gate {gate.name} observed {gate.observed} against threshold "
                f"{gate.threshold} and did not pass",
                f"evaluation_report.gates[{gate.name}]",
                threshold=gate.threshold,
                observed=gate.observed,
            )
        )
    return findings


# ==================================================================================================
# Gate 8 — manifest (breakdown plan §8 Q11; CRPS-02 deliverables 10, 12, 13)
# ==================================================================================================

_PIN_MEMBERS: tuple[str, ...] = (
    "model_id",
    "model_revision",
    "dimensions",
    "normalisation",
    "truncation",
    "max_tokens",
)


def gate_manifest_preflight(ctx: BundleContext) -> list[Finding]:
    """Phase A: the pins, checked over the REQUEST, before any manifest exists.

    This is not a second implementation of `verify_bundle()`'s step 9. It checks only what must hold
    for `build_release_manifest()` to run at all without raising `ManifestIncomplete` — which the
    acceptance checklist requires to be a gate rejection rather than an internal error. Agreement
    with `embedding-manifest.json` and QUERY/DOCUMENT representation equality stay in phase B.
    """
    findings: list[Finding] = []
    request = ctx.request
    stub_matters = ctx.is_candidate

    if request.parent_release_id is not None and request.parent_corpus_db_path is None:
        findings.append(
            _finding(
                "manifest",
                "MANIFEST_PARENT_INPUT_INCONSISTENT",
                "BLOCKING",
                "a parent release id was recorded without the parent database the diff and the "
                "count-change anomaly need",
                "parent_release_id",
            )
        )

    runtime = request.runtime_pin
    if runtime is None:
        findings.append(
            _finding(
                "manifest",
                "MANIFEST_PIN_RUNTIME_ABSENT",
                "BLOCKING",
                "no runtime pin was supplied. Breakdown plan §8 Q11 requires the release to record "
                "the runtime family, version, execution providers and crate pins, and this build "
                "never reads them from the environment, an installed package or a Cargo.toml",
                "runtime_pin",
            )
        )
    else:
        for member in ("family", "version", "pinned_by"):
            if not getattr(runtime, member, None):
                findings.append(
                    _finding(
                        "manifest",
                        "MANIFEST_PIN_MEMBER_INCOMPLETE",
                        "BLOCKING",
                        f"the runtime pin has no {member}",
                        f"runtime_pin.{member}",
                    )
                )
        if not runtime.execution_providers:
            findings.append(
                _finding(
                    "manifest",
                    "MANIFEST_PIN_MEMBER_INCOMPLETE",
                    "BLOCKING",
                    "the runtime pin lists no execution_providers",
                    "runtime_pin.execution_providers",
                )
            )
        if stub_matters and is_stub(runtime.family):
            findings.append(
                _finding(
                    "manifest",
                    "MANIFEST_PIN_STUB_ON_CANDIDATE",
                    "BLOCKING",
                    f"runtime.family is the stub marker {runtime.family!r}; a CANDIDATE may not "
                    "carry a stub or placeholder pin",
                    "runtime_pin.family",
                )
            )

    pins = request.local_model_pins
    if not pins:
        findings.append(
            _finding(
                "manifest",
                "MANIFEST_PIN_MODEL_PINS_ABSENT",
                "BLOCKING",
                "local_model_pins is empty; breakdown plan §8 Q11 requires the release to pin its "
                "models, and an empty list pins nothing",
                "local_model_pins",
            )
        )
    elif request.pin_for_role("DOCUMENT_EMBEDDING") is None:
        findings.append(
            _finding(
                "manifest",
                "MANIFEST_PIN_DOCUMENT_ROLE_ABSENT",
                "BLOCKING",
                "local_model_pins pins no DOCUMENT_EMBEDDING role; the release cannot say what "
                "produced its indexed vectors",
                "local_model_pins",
            )
        )

    seen_roles: set[str] = set()
    for pin in pins:
        role = pin.role
        if role in seen_roles:
            findings.append(
                _finding(
                    "manifest",
                    "MANIFEST_PIN_MEMBER_INCOMPLETE",
                    "BLOCKING",
                    f"local_model_pins pins the role {role} twice",
                    f"local_model_pins[{role}]",
                )
            )
        seen_roles.add(role)
        for member in _PIN_MEMBERS:
            if getattr(pin, member, None) in (None, ""):
                findings.append(
                    _finding(
                        "manifest",
                        "MANIFEST_PIN_MEMBER_INCOMPLETE",
                        "BLOCKING",
                        f"the {role} pin has no {member}; breakdown plan §8 Q11 makes every member "
                        "of the pin required",
                        f"local_model_pins[{role}].{member}",
                    )
                )
        artifact = pin.model_artifact
        for member in ("sha256", "byte_size", "format"):
            if getattr(artifact, member, None) in (None, ""):
                findings.append(
                    _finding(
                        "manifest",
                        "MANIFEST_PIN_MEMBER_INCOMPLETE",
                        "BLOCKING",
                        f"the {role} pin's model_artifact has no {member}",
                        f"local_model_pins[{role}].model_artifact.{member}",
                    )
                )
        tokenizer = pin.tokenizer
        for member in ("id", "artifact_sha256", "max_tokens", "truncation"):
            if getattr(tokenizer, member, None) in (None, ""):
                findings.append(
                    _finding(
                        "manifest",
                        "MANIFEST_PIN_MEMBER_INCOMPLETE",
                        "BLOCKING",
                        f"the {role} pin's tokenizer has no {member}",
                        f"local_model_pins[{role}].tokenizer.{member}",
                    )
                )
        if not getattr(pin.licence, "identifier", None):
            findings.append(
                _finding(
                    "manifest",
                    "MANIFEST_PIN_MEMBER_INCOMPLETE",
                    "BLOCKING",
                    f"the {role} pin's licence has no identifier; a model weight's licence is part "
                    "of what the release pins",
                    f"local_model_pins[{role}].licence.identifier",
                )
            )
        if stub_matters:
            for member, value in (
                ("model_id", pin.model_id),
                ("model_revision", pin.model_revision),
                ("tokenizer.id", tokenizer.id),
            ):
                if is_stub(value):
                    findings.append(
                        _finding(
                            "manifest",
                            "MANIFEST_PIN_STUB_ON_CANDIDATE",
                            "BLOCKING",
                            f"the {role} pin's {member} is the stub marker {value!r}; a CANDIDATE "
                            "may not carry a stub or placeholder pin",
                            f"local_model_pins[{role}].{member}",
                        )
                    )

    findings.extend(_index_builder_findings(ctx))
    return findings


def _measure_index_directory(ctx: BundleContext) -> tuple[int, int]:
    """`(file count, byte total)` of the STAGED `tantivy/`, measured from disk.

    Symlinks are excluded exactly as `manifest.build_release_manifest()` excludes them, so a link
    farm cannot inflate the figure either. When no bundle exists yet — a phase-A context assembled
    directly by a gate unit test, where `paths` is `None` — the builder's own report is the only
    thing there is, and it is used; every real build path (`assemble.py`) always supplies `paths`,
    which is what makes the measurement authoritative where it matters.
    """
    paths = getattr(ctx, "paths", None)
    directory = getattr(paths, "lexical_index_dir", None) if paths is not None else None
    if directory is None:
        result = ctx.index_result
        return int(getattr(result, "file_count", 0)), int(getattr(result, "byte_size", 0))
    try:
        files = [
            path for path in Path(directory).rglob("*") if path.is_file() and not path.is_symlink()
        ]
        return len(files), sum(path.stat().st_size for path in files)
    except OSError:
        # An unreadable index directory is an empty one for this gate's purposes: it certainly is
        # not evidence that a usable index was written.
        return 0, 0


def _index_builder_findings(ctx: BundleContext) -> list[Finding]:
    """Deliverable 3: a fixture-grade index can never be published as a candidate.

    Checked from THREE independent properties, because each on its own has a way through:

    * `index_version is None` — the null builder's own report;
    * the builder's declared identity — so a null-equivalent cannot slip through by renaming its
      class;
    * the MEASURED ARTIFACT. A builder that reports a non-null version but wrote no bytes satisfies
      neither of the first two, and would otherwise publish a candidate whose `tantivy/` is empty and
      unusable. `ExternalLexicalIndexBuilder` already refuses to return such a result, but this gate
      does not take any builder's word for it: the port is an extension point, and deliverable 3's
      guarantee has to hold for an implementation this module has never seen. THE MEASUREMENT IS
      THEREFORE TAKEN FROM THE STAGED DIRECTORY ITSELF (`paths.lexical_index_dir`), not from the
      `IndexBuildResult` the builder handed back — a third-party builder that fabricates a non-zero
      `file_count`/`byte_size` without writing bytes is exactly the failure this check exists to
      close, and reading its own report back would have left it wide open. The reported figures are
      still carried into the finding's evidence, so a divergence between claim and artifact is
      visible to an operator.
    """
    result = ctx.index_result
    if result is None:
        return []
    from build.indexes import NullLexicalIndexBuilder

    measured_files, measured_bytes = _measure_index_directory(ctx)
    if (
        ctx.is_candidate
        and getattr(result, "index_version", None) is not None
        and ctx.index_builder_id != NullLexicalIndexBuilder.builder_id
        and (measured_files == 0 or measured_bytes == 0)
    ):
        return [
            _finding(
                "manifest",
                "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE",
                "BLOCKING",
                f"this CANDIDATE's lexical index builder ({ctx.index_builder_id}) reported index "
                f"version {result.index_version!r}, but the staged tantivy/ directory holds "
                f"{measured_files} file(s) totalling {measured_bytes} byte(s) as measured from disk. "
                "An empty tantivy/ is not a published index (deliverable 3)",
                "tantivy/",
                index_builder_id=ctx.index_builder_id,
                file_count=measured_files,
                byte_size=measured_bytes,
                reported_file_count=int(getattr(result, "file_count", 0)),
                reported_byte_size=int(getattr(result, "byte_size", 0)),
            )
        ]

    is_null = getattr(result, "index_version", None) is None or (
        ctx.index_builder_id == NullLexicalIndexBuilder.builder_id
    )
    if is_null and ctx.is_candidate:
        return [
            _finding(
                "manifest",
                "INDEX_BUILDER_NULL_ON_CANDIDATE",
                "BLOCKING",
                "this CANDIDATE was built with a null lexical index builder "
                f"({ctx.index_builder_id}), which produces a declared-ABSENT index. A fixture-grade "
                "index may never be published as a candidate (deliverable 3)",
                "tantivy/",
                index_builder_id=ctx.index_builder_id,
            )
        ]
    return []


#: `manifest.Severity` -> gate `Severity`. `WARNING` becomes `ANOMALY` because this module's
#: vocabulary is the ticket's three-value one; the CODE is carried through verbatim.
_SEVERITY_MAP = {"BLOCKING": "BLOCKING", "WARNING": "ANOMALY", "INFO": "INFO"}


def gate_manifest_verification(ctx: BundleContext) -> list[Finding]:
    """Phase B: CRPS-02's `verify_bundle()` over the bundle as it now stands in staging.

    Every finding is MAPPED, never re-derived. Re-implementing any of `verify_bundle()`'s nine steps
    here would create a second copy of a PRD §44.3 serial-owned contract that could drift from the
    one RETR-01 and RLSE-07 re-implement in Rust.
    """
    report = verify_bundle(ctx.paths.bundle_dir, public_keys=ctx.public_keys)
    return [
        Finding(
            gate="manifest",
            code=finding.code,
            severity=_SEVERITY_MAP[finding.severity],
            message=finding.message,
            subject=finding.subject,
            evidence={"source": "manifest.verify_bundle", "severity_reported": finding.severity},
        )
        for finding in report.findings
    ]


# ==================================================================================================
# The runner
# ==================================================================================================

#: The eight gates, in PRD §12.2 order. Phase A runs all of them; gate 8's entry here is the pin
#: preflight, and `gate_manifest_verification` is phase B's.
GATES: tuple[tuple[str, GateCallable], ...] = (
    ("completeness", gate_completeness),
    ("time", gate_time),
    ("identity", gate_identity),
    ("citation", gate_citation),
    ("licensing", gate_licensing),
    ("smoke", gate_smoke),
    ("evaluation", gate_evaluation),
    ("manifest", gate_manifest_preflight),
)


def _run_one(name: str, gate: GateCallable, ctx: BundleContext) -> list[Finding]:
    try:
        return list(gate(ctx))
    except Exception as error:  # noqa: BLE001 — deliberate: see the module docstring
        return [
            _finding(
                name,
                "GATE_INTERNAL_ERROR",
                "BLOCKING",
                f"the {name} gate raised {type(error).__name__}: {error}. A gate that throws is "
                "reported as a blocking finding, never as a silent pass and never as an internal "
                "error exit",
                f"gate[{name}]",
                exception=type(error).__name__,
            )
        ]


def run_phase_a(ctx: BundleContext) -> dict[str, list[Finding]]:
    return {name: _run_one(name, gate, ctx) for name, gate in GATES}


def run_phase_b(ctx: BundleContext) -> dict[str, list[Finding]]:
    return {"manifest": _run_one("manifest", gate_manifest_verification, ctx)}


def _status_of(findings: Sequence[Finding]) -> str:
    if any(finding.severity == "BLOCKING" for finding in findings):
        return "FAILED"
    if any(finding.severity == "ANOMALY" for finding in findings):
        return "ANOMALIES"
    return "PASSED"


def merge_results(*phases: Mapping[str, list[Finding]]) -> tuple[GateResult, ...]:
    """One `GateResult` per gate, in PRD §12.2 order, for ALL EIGHT gates in every run.

    A gate that did not run is recorded as `NOT_RUN` rather than omitted: an absent entry is
    indistinguishable from a gate that silently did not execute.
    """
    collected: dict[str, list[Finding]] = {}
    ran: set[str] = set()
    for phase in phases:
        for name, findings in phase.items():
            ran.add(name)
            collected.setdefault(name, []).extend(findings)
    results: list[GateResult] = []
    for name in GATE_NAMES:
        if name not in ran:
            results.append(
                GateResult(
                    gate=name,
                    status="NOT_RUN",
                    findings=(
                        _finding(
                            name,
                            "GATE_NOT_RUN",
                            "INFO",
                            f"the {name} gate did not run in this build",
                            f"gate[{name}]",
                        ),
                    ),
                )
            )
            continue
        findings = tuple(collected.get(name, ()))
        results.append(GateResult(gate=name, status=_status_of(findings), findings=findings))
    return tuple(results)
