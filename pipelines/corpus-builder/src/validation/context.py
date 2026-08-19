"""`BundleContext` — everything the eight gates read, computed once (CRPS-06 deliverable 4).

WHY A CONTEXT OBJECT RATHER THAN EIGHT INDEPENDENT QUERIES. The completeness gate compares the
manifest's `counts` against the database, and the manifest is BUILT from the same figures. If the
gate and the builder each ran their own query, a divergence between the two queries would look like
a corpus defect. So the numbers are computed once, here, and both consumers read them.

CONNECTION DISCIPLINE, which is load-bearing on Windows. `connect()` opens the STAGED copy
`read_only=True` — a `file:…?mode=ro` URI SQLite itself refuses to write — and every gate uses
`with closing(ctx.connect()) as conn:`. No gate holds a connection across calls, because an open
handle blocks the caller's temp-directory teardown on Windows and surfaces as a flaky test rather
than a clear failure (the same reason `manifest/verify.py` documents).

The staged corpus database is NEVER opened read-write, by anything, at any point in the build. See
`build/assemble.py` for why that is a deliberate design property rather than an omission.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from contracts.schema import open_corpus_database

__all__ = ["BundleContext", "read_only_connector"]


def read_only_connector(path: Path) -> Callable[[], sqlite3.Connection]:
    """A factory that opens *path* read-only, for `BundleContext.connect`."""

    def connect() -> sqlite3.Connection:
        return open_corpus_database(path, read_only=True)

    return connect


@dataclass(frozen=True)
class BundleContext:
    """The inputs of one gate run.

    `manifest_document` is `None` during phase A (before a manifest exists) and carries the built
    manifest's JSON during phase B — see `build/assemble.py` §"two-phase gating".
    """

    request: Any
    paths: Any
    connect: Callable[[], sqlite3.Connection]
    parent_connect: Callable[[], sqlite3.Connection] | None
    embedding_manifest: Mapping[str, Any] | None
    embedding_report: Mapping[str, Any] | None
    index_result: Any
    index_builder_id: str
    public_keys: Mapping[str, bytes]
    #: The `manifest.Counts` the build will record. The completeness gate re-derives the same
    #: figures with its OWN queries, in its own module, and compares field by field — which is only
    #: a real check because the two implementations are independent.
    declared_counts: Any = None
    manifest_document: Mapping[str, Any] | None = None
    evaluation_report: Any = None

    @property
    def release_kind(self) -> str:
        return str(self.request.release_kind)

    @property
    def is_candidate(self) -> bool:
        return self.release_kind == "CANDIDATE"
