"""Re-export of the `CRPS-01` intermediate normalised-record payload types (deliverable 2, D8).

PRD §40.7: the adapter "emits versioned intermediate records". Breakdown plan §2.1 **A4** gives the
record types to `CRPS-01`, whose Python surface is
`pipelines/corpus-builder/src/contracts/records.py`. This module therefore ALIASES them — no
subclass, no wrapper, no re-declaration. The alias IS the whole contract: a test asserts object
identity (`DocumentVersionRecord is contracts.records.DocumentVersion`), so a copy would fail the
build. If an upstream shape ever changes, the writeback target is sub-PRD D8 plus INGF-01
deliverable 2, never a local copy here.

Note (measured): importing this module imports `contracts`, whose package `__init__` eagerly imports
`contracts.schema`, which imports `sqlite3` for the corpus builder's OWN schema helper. That is the
builder's business. Nothing on the ingestion or adapter side ever calls it, and the architecture
scan (deliverable 11) forbids any module under `pipelines/adapters/**` from importing `sqlite3` or
`contracts.schema` directly.
"""

from __future__ import annotations

from .. import _ensure_contracts_importable

_ensure_contracts_importable()

from contracts.records import (  # noqa: E402
    DocumentVersion as DocumentVersionRecord,
    LegalEvent as LegalEventRecord,
    NodeRelation as NodeRelationRecord,
    NodeVersion as NodeVersionRecord,
    SourceArtifact as SourceArtifactRecord,
)

__all__ = [
    "DocumentVersionRecord",
    "LegalEventRecord",
    "NodeRelationRecord",
    "NodeVersionRecord",
    "SourceArtifactRecord",
]
