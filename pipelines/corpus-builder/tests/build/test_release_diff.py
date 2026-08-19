"""`release_diff()` — every change type, with before/after ids and dates. PRD §33.4, §35.6."""

from __future__ import annotations

import json
import sqlite3
from typing import Callable

from candidate_fixtures import TS, Candidate
from candidate_paths import SRC  # noqa: F401

from build import CHANGE_TYPES, assemble_bundle, release_diff
from build.diff import write_release_diff


def test_with_no_parent_every_document_is_added(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    diff = release_diff(None, candidate.corpus_db)
    assert diff.parent_present is False
    assert {change.change_type for change in diff.changes} == {"ADDED"}
    assert len(diff.changes) == 2
    assert all(change.after_document_version_id for change in diff.changes)


def test_the_file_is_written_even_with_no_parent(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    document = json.loads(outcome.release_diff_path.read_text(encoding="utf-8"))
    assert document["parent_present"] is False
    assert document["change_count"] == 2


def _mutate(connection: sqlite3.Connection) -> None:
    """One mutation per remaining change type, applied to the CANDIDATE side."""
    # REMOVED: drop the decision document (and the rows that reference it).
    connection.execute("DELETE FROM chunk_embedding WHERE search_chunk_id IN"
                       " (SELECT id FROM search_chunk WHERE node_version_id = 'nv_case_1')")
    connection.execute("DELETE FROM search_chunk WHERE node_version_id = 'nv_case_1'")
    connection.execute("PRAGMA recursive_triggers = OFF")
    connection.execute("DROP TRIGGER node_version_no_delete")
    connection.execute("DROP TRIGGER document_version_no_delete")
    connection.execute("DROP TRIGGER document_node_no_delete")
    connection.execute("DELETE FROM node_version WHERE id = 'nv_case_1'")
    connection.execute("DELETE FROM document_node WHERE id = 'node_case_p12'")
    connection.execute("DELETE FROM document_version WHERE id = 'dv_case_1'")
    connection.execute("DELETE FROM legal_document WHERE id = 'doc_case'")

    # ADDED: a brand new document under an existing source.
    connection.execute(
        "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
        " official_identifier, neutral_citation, employer_abn, stable_source_key, created_at)"
        " VALUES ('doc_new', 'src_001', 'GUIDANCE', 'New guidance', NULL, NULL, NULL,"
        " 'NEW-GUIDANCE-1', ?)",
        (TS,),
    )

    # VERSION_ADDED: a third version of the Act.
    connection.execute(
        "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
        " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
        " content_hash, official_url, created_at)"
        " VALUES ('dv_act_3', 'doc_act', 'art_001', '2026-07-01', '2026-07-01', '2026-07-01',"
        " NULL, 'IN_FORCE', ?, ?, 'https://example.invalid/a', ?)",
        (TS, "a" * 64, TS),
    )

    # STATUS_CHANGED: the 2022 version is now superseded by the 2026 one.
    connection.execute("DROP TRIGGER document_version_no_update")
    connection.execute(
        "UPDATE document_version SET legal_status = 'SUPERSEDED' WHERE id = 'dv_act_2'"
    )

    # TEXT_CHANGED: the 2019 node's text is re-parsed.
    connection.execute("DROP TRIGGER node_version_no_update")
    new_text = "14 Liability to pay the synthetic levy, as re-parsed for the candidate release."
    connection.execute(
        "UPDATE node_version SET canonical_text = ?, text_hash = ? WHERE id = 'nv_act_1'",
        (new_text, __import__("hashlib").sha256(new_text.encode("utf-8")).hexdigest()),
    )

    # RELATION_CHANGED: the amendment relation is dropped.
    connection.execute("DROP TRIGGER node_relation_no_delete")
    connection.execute("DELETE FROM node_relation WHERE id = 'nrel_1'")


def test_every_change_type_is_reported_with_ids_and_dates(
    candidate_factory: Callable[..., Candidate]
) -> None:
    parent = candidate_factory()
    child = candidate_factory(customise=_mutate)

    diff = release_diff(parent.corpus_db, child.corpus_db)
    assert diff.parent_present is True
    reported = {change.change_type for change in diff.changes}
    assert reported == set(CHANGE_TYPES), sorted(set(CHANGE_TYPES) - reported)

    added = diff.of_type("ADDED")[0]
    assert added.source_id == "src_001"
    removed = diff.of_type("REMOVED")[0]
    assert removed.before_document_version_id == "dv_case_1"
    assert removed.effective_from == "2024-01-01"

    version_added = diff.of_type("VERSION_ADDED")[0]
    assert version_added.after_document_version_id == "dv_act_3"
    assert version_added.before_document_version_id is not None

    text_changed = diff.of_type("TEXT_CHANGED")[0]
    assert text_changed.changed_node_version_ids == ("nv_act_1",)

    status_changed = diff.of_type("STATUS_CHANGED")[0]
    assert status_changed.before_document_version_id == "dv_act_2"
    assert status_changed.after_document_version_id == "dv_act_2"

    relation_changed = diff.of_type("RELATION_CHANGED")[0]
    assert relation_changed.severity_hint == "MINOR"

    assert all(change.severity_hint for change in diff.changes)


def _twin_documents_with_a_relation_to(target_document: str) -> Callable[[sqlite3.Connection], None]:
    """Two sibling documents whose nodes share the stable node key `s14`, plus one relation from the
    Act's node to `target_document`'s copy of it.

    `stable_node_key` is unique only WITHIN a document (`document_node` carries a UNIQUE index on
    `(document_id, stable_node_key)`), so two documents legitimately holding an `s14` is ordinary
    corpus material, not a contrivance — a principal Act and its regulation both have one.
    """

    def customise(connection: sqlite3.Connection) -> None:
        for suffix in ("b", "c"):
            document_id = f"doc_{suffix}"
            connection.execute(
                "INSERT INTO legal_document (id, source_id, document_type, canonical_title,"
                " official_identifier, neutral_citation, employer_abn, stable_source_key,"
                " created_at) VALUES (?, 'src_001', 'PRIMARY_LEGISLATION', ?, NULL, NULL, NULL,"
                " ?, ?)",
                (document_id, f"Twin instrument {suffix}", f"TWIN-{suffix.upper()}", TS),
            )
            connection.execute(
                "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
                " publication_date, effective_from, effective_to, legal_status, retrieved_at,"
                " content_hash, official_url, created_at)"
                " VALUES (?, ?, 'art_001', '2020-01-01', '2020-01-01', '2020-01-01', NULL,"
                " 'IN_FORCE', ?, ?, 'https://example.invalid/a', ?)",
                (f"dv_{suffix}", document_id, TS, "a" * 64, TS),
            )
            connection.execute(
                "INSERT INTO document_node (id, document_id, stable_node_key, node_kind, created_at)"
                " VALUES (?, ?, 's14', 'SECTION', ?)",
                (f"node_{suffix}_s14", document_id, TS),
            )
            text = f"14 The twin provision in instrument {suffix} of the invented series."
            connection.execute(
                "INSERT INTO node_version (id, document_version_id, document_node_id,"
                " parent_node_version_id, display_label, heading, canonical_text, ordinal,"
                " effective_from, effective_to, text_hash, created_at)"
                " VALUES (?, ?, ?, NULL, NULL, NULL, ?, 0, '2020-01-01', NULL, ?, ?)",
                (
                    f"nv_{suffix}",
                    f"dv_{suffix}",
                    f"node_{suffix}_s14",
                    text,
                    __import__("hashlib").sha256(text.encode("utf-8")).hexdigest(),
                    TS,
                ),
            )
        connection.execute(
            "INSERT INTO node_relation (id, from_node_version_id, to_node_version_id,"
            " relation_type, evidence_node_version_id, evidence_start, evidence_end, derivation,"
            " parser_version, confidence_state, created_at)"
            " VALUES ('nrel_twin', 'nv_act_2', ?, 'AMENDS', 'nv_act_2', 0, 10, 'phrase match',"
            " '1.0.0', 'PARSER_DETERMINISTIC', ?)",
            (f"nv_{target_document}", TS),
        )

    return customise


def test_retargeting_a_relation_across_documents_is_reported(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """REGRESSION (reviewer, MEDIUM). The relation fingerprint must name the TARGET's document.

    Before this, the fingerprint was `(from_stable_node_key, relation_type, to_stable_node_key)`.
    Because `stable_node_key` is unique only within a document, moving a relation from `doc_b`'s
    `s14` to `doc_c`'s `s14` produced an IDENTICAL fingerprint on both sides, the relation sets
    compared equal, and no `RELATION_CHANGED` was emitted — a silent detection gap in exactly the
    corpus-side signal `WTCH-02` is `blocked_by` this ticket to consume.
    """
    parent = candidate_factory(customise=_twin_documents_with_a_relation_to("b"))
    child = candidate_factory(customise=_twin_documents_with_a_relation_to("c"))

    diff = release_diff(parent.corpus_db, child.corpus_db)

    relation_changes = diff.of_type("RELATION_CHANGED")
    assert relation_changes, [change.change_type for change in diff.changes]
    # The change belongs to the document the relation points FROM — the Act.
    assert any(change.document_id == "doc_act" for change in relation_changes)


def test_an_unchanged_cross_document_relation_is_not_reported(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """The widened fingerprint must not manufacture a change where none exists."""
    parent = candidate_factory(customise=_twin_documents_with_a_relation_to("b"))
    child = candidate_factory(customise=_twin_documents_with_a_relation_to("b"))
    assert release_diff(parent.corpus_db, child.corpus_db).changes == ()


def test_the_corpus_side_vocabulary_is_not_the_monitor_s(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """PRD §8.8's `ChangeType` (`AMENDMENT`, `COMMENCEMENT`, …) is `WTCH-02`'s, not this diff's."""
    assert "AMENDMENT" not in CHANGE_TYPES
    assert "COMMENCEMENT" not in CHANGE_TYPES


def test_matching_is_by_natural_key_not_row_id(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """Two independently built corpora of the same material must diff to nothing."""
    first = candidate_factory()
    second = candidate_factory()
    diff = release_diff(first.corpus_db, second.corpus_db)
    assert diff.changes == ()


def test_the_written_file_round_trips(
    candidate_factory: Callable[..., Candidate], tmp_path
) -> None:
    candidate = candidate_factory()
    diff = release_diff(None, candidate.corpus_db)
    path = write_release_diff(diff, tmp_path / "release-diff.json")
    document = json.loads(path.read_text(encoding="utf-8"))
    assert document["changes"][0]["change_type"] == "ADDED"
    assert set(document["changes"][0]) == {
        "document_id",
        "source_id",
        "change_type",
        "before_document_version_id",
        "after_document_version_id",
        "changed_node_version_ids",
        "effective_from",
        "publication_date",
        "severity_hint",
    }
