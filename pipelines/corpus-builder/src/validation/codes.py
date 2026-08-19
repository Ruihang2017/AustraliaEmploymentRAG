"""The closed gate-finding vocabulary (CRPS-06 deliverable 4).

WHY A CLOSED TABLE, and why it is a DIFFERENT table from `manifest.FINDING_CODES`.

`manifest.Finding` has four members (`code`, `severity`, `message`, `subject`) and its own closed
table, and its severities are `BLOCKING|WARNING|INFO`. The ticket fixes this module's finding shape
as `{gate, code, severity: BLOCKING|ANOMALY|INFO, message, subject, evidence}` — six members and a
different severity vocabulary. Collapsing the two would either lose the `gate` attribution or
silently rename `WARNING` to `ANOMALY` inside CRPS-02's contract, which is another ticket's file.
So this module declares its own type and its own table, and gate 8 MAPS a `manifest.Finding` into a
gate `Finding` (`BLOCKING->BLOCKING`, `WARNING->ANOMALY`, `INFO->INFO`) carrying the code verbatim.

Because gate 8 carries CRPS-02's codes through unchanged, they are ADDED to this table by importing
`manifest.FINDING_CODES` rather than re-typing them: a re-typed list would drift the first time
CRPS-02 adds a code, and the drift would surface as a `ValueError` inside a gate rather than as a
finding.

The discipline mirrors `manifest/findings.py`, `chunking/validate.py` and `contracts/violations.py`:
an undeclared code is rejected at construction, so a new failure mode has to be named here (and in
the ticket) before it can be emitted.
"""

from __future__ import annotations

from typing import Final, Literal

from manifest import FINDING_CODES as MANIFEST_FINDING_CODES

__all__ = [
    "GATE_CODES",
    "GATE_NAMES",
    "OWN_GATE_CODES",
    "Severity",
]

Severity = Literal["BLOCKING", "ANOMALY", "INFO"]

#: The eight PRD §12.2 gates, IN THE ORDER PRD §12.2 states them. `run_gates()` records a result for
#: every one of them in every report — a gate that did not run says so, and is never simply absent.
GATE_NAMES: Final[tuple[str, ...]] = (
    "completeness",
    "time",
    "identity",
    "citation",
    "licensing",
    "smoke",
    "evaluation",
    "manifest",
)

#: Codes this module emits itself. Grouped by the gate that owns each one.
OWN_GATE_CODES: Final[frozenset[str]] = frozenset(
    {
        # -- the runner itself -------------------------------------------------------------------
        # A gate that raised. It becomes a BLOCKING finding rather than an exit-1, because a build
        # whose job is to find bad data must not fall over when it finds some.
        "GATE_INTERNAL_ERROR",
        # A gate that could not run, with the reason. Emitted so that an operator never has to infer
        # from an absent entry that a check was skipped.
        "GATE_NOT_RUN",
        # -- gate 1: completeness ----------------------------------------------------------------
        "COMPLETENESS_SOURCE_GROUP_MISSING",
        "COMPLETENESS_SOURCE_GROUP_PLANNED_NOT_ACTIVE",
        "COMPLETENESS_SOURCE_GROUP_LIMITED",
        "COMPLETENESS_COVERAGE_STATUS_UNKNOWN",
        "COMPLETENESS_COUNT_MISMATCH",
        "COMPLETENESS_EMBEDDING_COUNT_DISAGREEMENT",
        # Quarantine (PRD §35.3) is attributed to the completeness gate: an open quarantine item is
        # a statement about what may be INCLUDED in the release, which is what completeness judges.
        "QUARANTINE_OPEN",
        # The PRD §40.9 flag-rather-fail rules, also attributed to completeness.
        "ANOMALY_COLLECTION_COUNT_CHANGE",
        "ANOMALY_PARSE_FAILURE_RATE",
        "ANOMALY_NOT_MEASURABLE",
        "ANOMALY_NO_PARENT",
        # -- gate 2: time ------------------------------------------------------------------------
        "TIME_INTERVAL_INVERTED",
        "TIME_CONSOLIDATED_OVERLAP",
        "TIME_DATE_MALFORMED",
        "TIME_EVENT_EFFECTIVE_DATE_ABSENT",
        "TIME_EVENT_TYPE_UNRECOGNISED",
        "TIME_EFFECTIVE_FROM_ABSENT",
        # -- gate 3: identity --------------------------------------------------------------------
        # Spelled `..._IDENTITY` rather than `..._KEY`: the repository-wide secret scanner
        # (`.github/workflows/checks/secret-scan.mjs`, asserted by
        # `tests/manifest/test_no_private_keys_committed.py`) treats an uppercase identifier ending
        # in `_KEY` as credential-shaped. The guard is another module's and is not relaxed here.
        "IDENTITY_DUPLICATE_DOCUMENT_IDENTITY",
        "IDENTITY_DUPLICATE_NODE_IDENTITY",
        "IDENTITY_DOCUMENT_VERSION_UNRESOLVED",
        # -- gate 4: citation --------------------------------------------------------------------
        "CITATION_NODE_TEXT_HASH_MISMATCH",
        "CITATION_CHUNK_OFFSET_OUT_OF_RANGE",
        "CITATION_CHUNK_HASH_MISMATCH",
        "CITATION_CHUNK_RULE_VIOLATION",
        "CITATION_RELATION_EVIDENCE_OUT_OF_RANGE",
        "CITATION_NODE_UNCHUNKED",
        "CITATION_GOLD_BROKEN",
        # -- gate 5: licensing -------------------------------------------------------------------
        "LICENSING_ARTIFACT_SNAPSHOT_UNRESOLVED",
        "LICENSING_ASSESSMENT_ABSENT",
        "LICENSING_ASSESSMENT_PROHIBITED",
        "LICENSING_EXCLUDED_CHUNK_EMBEDDED",
        "LICENSING_EXCLUDED_CHUNK_LEXICAL",
        "LICENSING_TIER_UNKNOWN",
        # -- gate 6: smoke search (offline subset) -----------------------------------------------
        "SMOKE_PROBE_CLASS_ABSENT",
        "SMOKE_IDENTIFIER_LOOKUP_FAILED",
        "SMOKE_PROVISION_LOOKUP_FAILED",
        "SMOKE_POINT_IN_TIME_AMBIGUOUS",
        # -- gate 7: evaluation subset -----------------------------------------------------------
        "EVALUATION_REPORT_ABSENT",
        "EVALUATION_REPORT_MALFORMED",
        "EVALUATION_GATE_FAILED",
        "EVALUATION_NOT_RUN_ALLOWED",
        # -- gate 8: manifest --------------------------------------------------------------------
        # The pin PREFLIGHT's codes. They are deliberately NOT `manifest`'s `PIN_*` spellings: these
        # are checks over the BUILD REQUEST before any manifest exists, and conflating them with the
        # verifier's findings over a built manifest would make a report unreadable.
        "MANIFEST_PIN_RUNTIME_ABSENT",
        "MANIFEST_PIN_MODEL_PINS_ABSENT",
        "MANIFEST_PIN_DOCUMENT_ROLE_ABSENT",
        "MANIFEST_PIN_MEMBER_INCOMPLETE",
        "MANIFEST_PIN_STUB_ON_CANDIDATE",
        "MANIFEST_PARENT_INPUT_INCONSISTENT",
        "MANIFEST_BUILD_FAILED",
        "MANIFEST_SIGNING_FAILED",
        # Deliverable 3: a fixture-grade index can never be published as a candidate.
        "INDEX_BUILDER_NULL_ON_CANDIDATE",
        # …and neither can an EMPTY one. A builder that reports a version but writes no bytes is not
        # null by either of the two identity tests, so the artifact itself is measured as well.
        "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE",
        "INDEX_BUILDER_FAILED",
        # Every gate passed but the staged bundle could not be moved into the final output path.
        # The build is REJECTED, never BUILT: a `decision: BUILT` report must only ever exist once
        # the bundle it describes does.
        "BUNDLE_PUBLISH_FAILED",
    }
)

#: Every code a gate `Finding` may carry: this module's own, plus CRPS-02's, imported rather than
#: re-typed (see the module docstring).
GATE_CODES: Final[frozenset[str]] = OWN_GATE_CODES | MANIFEST_FINDING_CODES
