"""Version constants for the corpus schema and the intermediate normalised-record contract.

`SCHEMA_VERSION` is what `corpus_meta.schema_version` records, what the release manifest publishes
and what readiness compares (PRD §18.4, §42.1). Bump it on ANY change to
`schema/corpus/001_corpus_schema.sql` — including one that only changes a comment, because
`schema_fingerprint()` hashes the SQL SQLite stores.

`CONTRACT_VERSION` is the INR contract version carried in every record envelope. Its versioning
rule is CRPS-01 deliverable 16: adding an optional member is a MINOR bump in place; removing or
renaming a member, tightening a type, or changing a documented meaning is a MAJOR bump and requires
a new `schema/intermediate/v<N>/` directory. The reader accepts the current major and the
immediately previous major. Any major bump is a writeback — five source modules bind to it.
"""

from __future__ import annotations

__all__ = ["BUILDER_VERSION", "CONTRACT_VERSION", "SCHEMA_VERSION", "major_of"]

SCHEMA_VERSION: str = "1.0.0"
CONTRACT_VERSION: str = "1.0.0"

#: The corpus-builder pipeline's own version, recorded in `corpus_meta.builder_version`.
BUILDER_VERSION: str = "0.0.0"


def major_of(semver: str) -> int:
    """Return the major component of *semver*.

    Raises `ValueError` on anything that is not `<major>.<minor>.<patch>` with numeric parts.
    Callers that must not raise (`validate_record`) catch it and emit a violation instead.
    """
    parts = semver.split(".")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"not a semver string: {semver!r}")
    return int(parts[0])
