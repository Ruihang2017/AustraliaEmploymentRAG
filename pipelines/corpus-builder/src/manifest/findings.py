"""The closed finding vocabulary `verify_bundle()` reports, and the report that carries it.

WHY A CLOSED TABLE. PRD §21 makes the verifier the trust boundary: *"Trust application/corpus
artifacts only after signature/hash/compatibility verification."* An operator's response to
"the signing key is unknown to me" is completely different from their response to "the signature
does not verify under a key I know", so those must never collapse into one code (CRPS-02 acceptance
item 5). A closed table, asserted by a test that every code is exercised and that no emitted code
is outside it, is what stops a future edit from inventing a fifth spelling of an existing failure.

SEVERITY. The ticket's finding shape says `BLOCKING|WARNING`; deliverable 13 requires an `INFO`
finding for a stub pin on a `SYNTHETIC_FIXTURE`. Three severities satisfy both, and `ok` keys on
`BLOCKING` alone — an `INFO` or a `WARNING` never makes a bundle untrustworthy on its own. See the
plan's OQ-3: a one-line ticket correction, not a code change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping, Sequence

__all__ = [
    "FINDING_CODES",
    "Finding",
    "Severity",
    "VerificationReport",
]

Severity = Literal["BLOCKING", "WARNING", "INFO"]

#: Every code `verify_bundle()`, `verify_signature()` or a pin check may emit. Closed on purpose.
FINDING_CODES: frozenset[str] = frozenset(
    {
        # -- step 1: the manifest itself ---------------------------------------------------------
        "MANIFEST_ABSENT",
        "MANIFEST_UNPARSEABLE",
        "MANIFEST_VERSION_UNSUPPORTED",
        "MANIFEST_SCHEMA_INVALID",
        # -- step 2: the recorded digest ---------------------------------------------------------
        "MANIFEST_SHA256_MISMATCH",
        # -- step 3: the detached signature ------------------------------------------------------
        "SIGNATURE_ABSENT",
        "SIGNATURE_ALGORITHM_UNSUPPORTED",
        "SIGNATURE_SIGNER_UNKNOWN",
        "SIGNATURE_INVALID",
        "SIGNATURE_SIGNER_DEVELOPMENT",
        # -- steps 4 and 5: the bundle's files ---------------------------------------------------
        "BUNDLE_PATH_MISSING",
        "BUNDLE_PATH_UNSAFE",
        "BUNDLE_FILE_UNLISTED",
        "FILE_LISTED_BUT_ABSENT",
        "FILE_NOT_REGULAR",
        "FILE_HASH_MISMATCH",
        "FILE_SIZE_MISMATCH",
        # A manifest that lists ITSELF in files[]. It cannot carry its own hash, so the entry is
        # unverifiable by construction; saying so beats silently exempting the path.
        "FILE_SELF_REFERENCE",
        # -- step 6: artifacts[] against files[] -------------------------------------------------
        "ARTIFACT_HASH_MISMATCH",
        # -- step 7: the corpus database ---------------------------------------------------------
        "CORPUS_DATABASE_UNREADABLE",
        "CORPUS_SCHEMA_VERSION_MISMATCH",
        # -- step 8: compatibility ---------------------------------------------------------------
        "COMPATIBILITY_OUT_OF_RANGE",
        "COMPATIBILITY_VERSION_UNPARSEABLE",
        # -- step 9: pinning ---------------------------------------------------------------------
        "EMBEDDING_MANIFEST_ABSENT",
        "EMBEDDING_MANIFEST_UNPARSEABLE",
        "EMBEDDING_MANIFEST_SCHEMA_INVALID",
        "PIN_RUNTIME_ABSENT",
        "PIN_MODEL_ROLE_ABSENT",
        "PIN_MEMBER_ABSENT",
        "PIN_TOKENIZER_INCONSISTENT",
        "PIN_EMBEDDING_MANIFEST_DISAGREEMENT",
        "PIN_QUERY_REPRESENTATION_DISAGREEMENT",
        "PIN_STUB",
        # -- informational -----------------------------------------------------------------------
        "RELEASE_KIND_SYNTHETIC_FIXTURE",
    }
)


@dataclass(frozen=True)
class Finding:
    """One verification result.

    `subject` names WHAT failed (a bundle-relative path, a manifest member pointer, a role name) so
    an operator can act without re-reading the manifest. NO KEY MATERIAL, and no file content, ever
    goes into `message` or `subject` — PRD §20.2.
    """

    code: str
    severity: Severity
    message: str
    subject: str

    def __post_init__(self) -> None:
        if self.code not in FINDING_CODES:
            raise ValueError(
                f"{self.code!r} is not in the closed finding table; add it to FINDING_CODES with a "
                "test rather than emitting an undocumented code"
            )
        if self.severity not in ("BLOCKING", "WARNING", "INFO"):
            raise ValueError(f"{self.severity!r} is not a severity")


@dataclass(frozen=True)
class VerificationReport:
    """Everything `verify_bundle()` learned, in emission order.

    `ok` is the ONLY trust signal: no caller may act on a partial finding list, and a report is
    never `ok` while a BLOCKING finding is present.
    """

    findings: tuple[Finding, ...]
    release_kind: str | None
    manifest: Mapping[str, Any] | None

    @property
    def ok(self) -> bool:
        return not any(finding.severity == "BLOCKING" for finding in self.findings)

    def codes(self) -> tuple[str, ...]:
        return tuple(finding.code for finding in self.findings)

    def by_code(self, code: str) -> tuple[Finding, ...]:
        return tuple(finding for finding in self.findings if finding.code == code)

    def blocking(self) -> tuple[Finding, ...]:
        return tuple(finding for finding in self.findings if finding.severity == "BLOCKING")


def report_of(
    findings: Sequence[Finding],
    *,
    release_kind: str | None,
    manifest: Mapping[str, Any] | None,
) -> VerificationReport:
    return VerificationReport(tuple(findings), release_kind, manifest)
