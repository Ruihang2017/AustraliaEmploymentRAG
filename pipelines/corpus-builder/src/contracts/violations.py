"""The closed set of intermediate-record contract violations.

The codes are a contract in their own right: `tests/contracts/fixtures/invalid/**` pairs each broken
record with exactly one of them, and `INGF-01` plus the five source modules assert against them.
Adding, renaming or removing a code is a contract change (CRPS-01 deliverable 16), not a refactor.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

__all__ = ["VIOLATION_CODES", "ContractViolation"]

VIOLATION_CODES: Final[frozenset[str]] = frozenset(
    {
        # Checked first; short-circuits everything else.
        "CONTRACT_VERSION_UNSUPPORTED",
        "RECORD_TYPE_UNKNOWN",
        # JSON-Schema failure with no more specific code. Carries a JSON pointer.
        "SCHEMA_INVALID",
        # PRD §40.7: every record is traceable to a URL, a hash and a retrieval time.
        "PROVENANCE_MISSING",
        # Deliverable 11: a corpus primary key must never appear inside a payload.
        "CORPUS_ID_IN_RECORD",
        # Deliverable 12: text and offset rules.
        "TEXT_NOT_NFC",
        "TEXT_HASH_MISMATCH",
        "OFFSET_RANGE_INVALID",
        "OFFSET_OUT_OF_RANGE",
        # Deliverable 13: enumerated values.
        "ENUM_UNKNOWN_VALUE",
        "MODEL_SUGGESTED_DEFINITIVE",
        # Deliverable 14: the run manifest disagrees with the bytes on disk.
        "MANIFEST_HASH_MISMATCH",
        "MANIFEST_COUNT_MISMATCH",
    }
)


@dataclass(frozen=True, slots=True)
class ContractViolation:
    """One finding about one record. Never raised — always returned."""

    code: str
    message: str
    pointer: str = ""
    record_index: int = -1

    def __post_init__(self) -> None:
        if self.code not in VIOLATION_CODES:
            raise ValueError(
                f"{self.code!r} is not a declared contract violation code; add it to "
                "VIOLATION_CODES (and to the CRPS-01 contract) before using it"
            )
