"""`release_diff()` — the corpus-side change record `WTCH-02` consumes (CRPS-06 deliverable 8).

Basis: PRD §33.4 steps 4-6 (*"Validation either quarantines the change or includes it in a candidate
CorpusRelease"*) and PRD §35.6's `detected_change`, which needs *"source/corpus IDs, change type,
dates, before/after node/document IDs, severity"*.

THIS VOCABULARY IS NOT `packages/contracts`' `ChangeType`, AND MUST NOT BE "ALIGNED" WITH IT.
`ADDED | VERSION_ADDED | TEXT_CHANGED | STATUS_CHANGED | REMOVED | RELATION_CHANGED` describes what
happened to the CORPUS between two releases. `packages/contracts`' change-type family
(`AMENDMENT`, `COMMENCEMENT`, …) is PRD §8.8's MONITOR vocabulary, describing what happened to the
LAW. `WTCH-02` maps the first onto the second, which is precisely why they are different types: a
corpus-side `TEXT_CHANGED` may be an amendment, a correction or a re-parse, and only the monitor has
the evidence to say which.

`severity_hint` IS CORPUS-SIDE ONLY. It ranks how much of the record moved, not how much a tenant
should care — PRD §33.4 puts tenant-facing severity with the watch matcher, and this module has
neither the watch targets nor the tenant context to judge it.

MATCHING IS BY NATURAL KEY, NEVER BY ROW ID: `(source_id, stable_source_key)` for a document and
`(document key, stable_node_key)` for a node. Corpus primary keys are minted per build and differ
between two builds of the same material, so a row-id join would report the entire corpus as
replaced.

BOTH DATABASES ARE OPENED READ-ONLY. The parent bundle is an existing release and PRD §35.8
invariant 8 forbids mutating one; the candidate copy is never opened for writing by anything in this
module tree.
"""

from __future__ import annotations

import sqlite3
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

from contracts.schema import open_corpus_database

__all__ = [
    "CHANGE_TYPES",
    "SEVERITY_HINTS",
    "DocumentChange",
    "ReleaseDiff",
    "release_diff",
    "write_release_diff",
]

#: The corpus-side change vocabulary. Closed, and asserted at construction.
CHANGE_TYPES: tuple[str, ...] = (
    "ADDED",
    "VERSION_ADDED",
    "TEXT_CHANGED",
    "STATUS_CHANGED",
    "REMOVED",
    "RELATION_CHANGED",
)

#: How much of the record moved — corpus-side only (see the module docstring).
SEVERITY_HINTS: Mapping[str, str] = {
    "ADDED": "MATERIAL",
    "REMOVED": "MATERIAL",
    "VERSION_ADDED": "MATERIAL",
    "TEXT_CHANGED": "MATERIAL",
    "STATUS_CHANGED": "NOTABLE",
    "RELATION_CHANGED": "MINOR",
}


@dataclass(frozen=True)
class DocumentChange:
    document_id: str
    source_id: str
    change_type: str
    before_document_version_id: str | None
    after_document_version_id: str | None
    changed_node_version_ids: tuple[str, ...]
    effective_from: str | None
    publication_date: str | None
    severity_hint: str

    def __post_init__(self) -> None:
        if self.change_type not in CHANGE_TYPES:
            raise ValueError(
                f"{self.change_type!r} is not a corpus-side change type {CHANGE_TYPES!r}. Note that "
                "packages/contracts' ChangeType family is PRD §8.8's MONITOR vocabulary and is "
                "deliberately NOT this one"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "document_id": self.document_id,
            "source_id": self.source_id,
            "change_type": self.change_type,
            "before_document_version_id": self.before_document_version_id,
            "after_document_version_id": self.after_document_version_id,
            "changed_node_version_ids": list(self.changed_node_version_ids),
            "effective_from": self.effective_from,
            "publication_date": self.publication_date,
            "severity_hint": self.severity_hint,
        }


@dataclass(frozen=True)
class ReleaseDiff:
    parent_present: bool
    changes: tuple[DocumentChange, ...] = field(default_factory=tuple)

    def of_type(self, change_type: str) -> tuple[DocumentChange, ...]:
        return tuple(change for change in self.changes if change.change_type == change_type)

    def to_dict(self) -> dict[str, Any]:
        return {
            "parent_present": self.parent_present,
            "change_count": len(self.changes),
            "changes": [change.to_dict() for change in self.changes],
        }


# ==================================================================================================
# Reading one side
# ==================================================================================================


@dataclass(frozen=True)
class _Document:
    row_id: str
    source_id: str
    stable_source_key: str
    #: `version_label -> (row id, legal_status, effective_from, publication_date)`
    versions: Mapping[str, tuple[str, str, str | None, str | None]]
    #: `(stable_node_key, version_label) -> (node_version row id, text_hash)`
    node_texts: Mapping[tuple[str, str], tuple[str, str]]
    #: relation fingerprints, natural-keyed so two builds are comparable
    relations: frozenset[tuple[str, str, str]]


def _read_side(connection: sqlite3.Connection) -> dict[tuple[str, str], _Document]:
    documents: dict[tuple[str, str], dict[str, Any]] = {}
    for row in connection.execute(
        "SELECT id, source_id, stable_source_key FROM legal_document ORDER BY id"
    ).fetchall():
        documents[(str(row[1]), str(row[2]))] = {
            "row_id": str(row[0]),
            "source_id": str(row[1]),
            "stable_source_key": str(row[2]),
            "versions": {},
            "node_texts": {},
            "relations": set(),
        }
    by_row_id = {entry["row_id"]: entry for entry in documents.values()}

    for row in connection.execute(
        "SELECT id, document_id, version_label, legal_status, effective_from, publication_date"
        " FROM document_version ORDER BY id"
    ).fetchall():
        entry = by_row_id.get(str(row[1]))
        if entry is None:
            continue
        entry["versions"][str(row[2])] = (
            str(row[0]),
            str(row[3]),
            None if row[4] is None else str(row[4]),
            None if row[5] is None else str(row[5]),
        )

    for row in connection.execute(
        "SELECT nv.id, dn.document_id, dn.stable_node_key, dv.version_label, nv.text_hash"
        " FROM node_version nv"
        " JOIN document_node dn ON dn.id = nv.document_node_id"
        " JOIN document_version dv ON dv.id = nv.document_version_id"
        " ORDER BY nv.id"
    ).fetchall():
        entry = by_row_id.get(str(row[1]))
        if entry is None:
            continue
        entry["node_texts"][(str(row[2]), str(row[3]))] = (str(row[0]), str(row[4]))

    for row in connection.execute(
        "SELECT dn_from.document_id, dn_from.stable_node_key, r.relation_type,"
        " dn_to.stable_node_key FROM node_relation r"
        " JOIN node_version nv_from ON nv_from.id = r.from_node_version_id"
        " JOIN document_node dn_from ON dn_from.id = nv_from.document_node_id"
        " JOIN node_version nv_to ON nv_to.id = r.to_node_version_id"
        " JOIN document_node dn_to ON dn_to.id = nv_to.document_node_id"
        " ORDER BY r.id"
    ).fetchall():
        entry = by_row_id.get(str(row[0]))
        if entry is None:
            continue
        entry["relations"].add((str(row[1]), str(row[2]), str(row[3])))

    return {
        key: _Document(
            row_id=entry["row_id"],
            source_id=entry["source_id"],
            stable_source_key=entry["stable_source_key"],
            versions=dict(entry["versions"]),
            node_texts=dict(entry["node_texts"]),
            relations=frozenset(entry["relations"]),
        )
        for key, entry in documents.items()
    }


def _latest_version(document: _Document) -> tuple[str | None, str | None, str | None]:
    """`(row id, effective_from, publication_date)` of the version with the latest effect."""
    if not document.versions:
        return None, None, None
    label = sorted(
        document.versions,
        key=lambda item: (document.versions[item][2] or "", item),
    )[-1]
    row_id, _status, effective_from, publication_date = document.versions[label]
    return row_id, effective_from, publication_date


def _change(
    document: _Document,
    change_type: str,
    *,
    before: str | None = None,
    after: str | None = None,
    nodes: tuple[str, ...] = (),
) -> DocumentChange:
    _, effective_from, publication_date = _latest_version(document)
    return DocumentChange(
        document_id=document.row_id,
        source_id=document.source_id,
        change_type=change_type,
        before_document_version_id=before,
        after_document_version_id=after,
        changed_node_version_ids=nodes,
        effective_from=effective_from,
        publication_date=publication_date,
        severity_hint=SEVERITY_HINTS[change_type],
    )


# ==================================================================================================
# Entry point
# ==================================================================================================


def release_diff(parent_db: Path | None, candidate_db: Path) -> ReleaseDiff:
    """Compare two corpus databases. With no parent, every document is `ADDED`."""
    with closing(open_corpus_database(candidate_db, read_only=True)) as candidate_connection:
        candidate = _read_side(candidate_connection)

    if parent_db is None:
        changes = [
            _change(document, "ADDED", after=_latest_version(document)[0])
            for _, document in sorted(candidate.items())
        ]
        return ReleaseDiff(parent_present=False, changes=tuple(changes))

    with closing(open_corpus_database(parent_db, read_only=True)) as parent_connection:
        parent = _read_side(parent_connection)

    changes: list[DocumentChange] = []
    for key in sorted(set(candidate) | set(parent)):
        after = candidate.get(key)
        before = parent.get(key)
        if before is None and after is not None:
            changes.append(_change(after, "ADDED", after=_latest_version(after)[0]))
            continue
        if after is None and before is not None:
            changes.append(_change(before, "REMOVED", before=_latest_version(before)[0]))
            continue
        assert before is not None and after is not None

        added_labels = sorted(set(after.versions) - set(before.versions))
        for label in added_labels:
            changes.append(
                _change(
                    after,
                    "VERSION_ADDED",
                    before=_latest_version(before)[0],
                    after=after.versions[label][0],
                    nodes=tuple(
                        sorted(
                            node_id
                            for (_node_key, version_label), (node_id, _hash)
                            in after.node_texts.items()
                            if version_label == label
                        )
                    ),
                )
            )

        changed_nodes = tuple(
            sorted(
                node_id
                for node_key, (node_id, text_hash) in after.node_texts.items()
                if node_key in before.node_texts and before.node_texts[node_key][1] != text_hash
            )
        )
        if changed_nodes:
            changes.append(
                _change(
                    after,
                    "TEXT_CHANGED",
                    before=_latest_version(before)[0],
                    after=_latest_version(after)[0],
                    nodes=changed_nodes,
                )
            )

        status_moved = [
            label
            for label in sorted(set(after.versions) & set(before.versions))
            if after.versions[label][1] != before.versions[label][1]
        ]
        if status_moved:
            changes.append(
                _change(
                    after,
                    "STATUS_CHANGED",
                    before=before.versions[status_moved[0]][0],
                    after=after.versions[status_moved[0]][0],
                )
            )

        if after.relations != before.relations:
            changes.append(
                _change(
                    after,
                    "RELATION_CHANGED",
                    before=_latest_version(before)[0],
                    after=_latest_version(after)[0],
                )
            )

    return ReleaseDiff(parent_present=True, changes=tuple(changes))


def write_release_diff(diff: ReleaseDiff, path: Path) -> Path:
    from .report import write_json_atomically

    write_json_atomically(diff.to_dict(), path)
    return Path(path)
