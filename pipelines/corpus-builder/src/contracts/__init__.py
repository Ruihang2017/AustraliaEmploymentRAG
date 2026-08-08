"""`contracts` — the corpus schema and the intermediate normalised-record (INR) contract (CRPS-01).

IMPORT-PATH CONVENTION FOR `pipelines/corpus-builder/src/**` (binds CRPS-02 … CRPS-07)
--------------------------------------------------------------------------------------
Modules under `pipelines/corpus-builder/src/` are TOP-LEVEL Python modules rooted at
`pipelines/corpus-builder/src` — this package is imported as `contracts`, and its siblings will be
`manifest`, `chunking`, `tiering`, `build`, `validation`, `publish`. There is deliberately NO
`__init__.py` in `src/` itself, and no code in `taxrag_pipeline_corpus_builder/__init__.py`:
`tools/workspace-assertions.mjs::assertSkeleton()` requires each uv member to hold exactly ONE
top-level directory containing an `__init__.py`, and `assertEntryFilesEmpty()` requires that file to
stay byte-empty. Both run under `pnpm test` on every branch.

The member directory name contains a hyphen, so it is not importable as a package path either.
Tests therefore put `pipelines/corpus-builder/src` on `sys.path` from a per-test-directory
`conftest.py`. This convention is awkward to reverse once four tickets have adopted it and is
flagged as an ADR candidate in the CRPS-01 writeback.

WHAT IS HERE
------------
* `schema` — create / open / fingerprint a `corpus.sqlite` database (PRD §18.3, §35, §42.1).
* `enums` — generate the DDL's enum `CHECK` lists from the `packages/contracts` export (PRD §35.1).
* `records`, `io`, `validate`, `violations` — the INR contract's Python surface (PRD §40.7).

The language-neutral halves — `schema/corpus/001_corpus_schema.sql` and
`schema/intermediate/v1/**` — are the actual contracts. A source module conforms by reading those,
never this package (breakdown plan A4).
"""

from __future__ import annotations

from .enums import load_contract_enums, render_enum_checks
from .io import (
    MANIFEST_NAME,
    RecordFileStat,
    RunRecords,
    read_records,
    read_run,
    write_records,
    write_run,
)
from .paths import CORPUS_SCHEMA_DIR, INTERMEDIATE_SCHEMA_DIR, SCHEMA_DIR
from .records import (
    RECORD_TYPES,
    DocumentIdentity,
    DocumentNode,
    DocumentVersion,
    Envelope,
    LegalEvent,
    NodeRef,
    NodeRelation,
    NodeVersion,
    Provenance,
    RemoteDescriptor,
    SourceArtifact,
    ToolVersions,
    ValidationFinding,
    VersionRef,
)
from .schema import (
    create_corpus_database,
    open_corpus_database,
    render_corpus_ddl,
    schema_fingerprint,
)
from .validate import validate_record
from .version import BUILDER_VERSION, CONTRACT_VERSION, SCHEMA_VERSION
from .violations import VIOLATION_CODES, ContractViolation

__all__ = [
    "BUILDER_VERSION",
    "CONTRACT_VERSION",
    "CORPUS_SCHEMA_DIR",
    "INTERMEDIATE_SCHEMA_DIR",
    "MANIFEST_NAME",
    "RECORD_TYPES",
    "SCHEMA_DIR",
    "SCHEMA_VERSION",
    "VIOLATION_CODES",
    "ContractViolation",
    "DocumentIdentity",
    "DocumentNode",
    "DocumentVersion",
    "Envelope",
    "LegalEvent",
    "NodeRef",
    "NodeRelation",
    "NodeVersion",
    "Provenance",
    "RecordFileStat",
    "RemoteDescriptor",
    "RunRecords",
    "SourceArtifact",
    "ToolVersions",
    "ValidationFinding",
    "VersionRef",
    "create_corpus_database",
    "load_contract_enums",
    "open_corpus_database",
    "read_records",
    "read_run",
    "render_corpus_ddl",
    "render_enum_checks",
    "schema_fingerprint",
    "validate_record",
    "write_records",
    "write_run",
]
