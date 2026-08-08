"""Enum drift, in BOTH directions (PRD §35.1; CRPS-01 acceptance item 2, test plan step 4).

Every enumerated column's `CHECK` list must equal the corresponding `packages/contracts` export.
This suite fails — never skips — if the export is missing or a named family is absent, naming
**Q-CRPS-4** and **FND-03** so the reader knows whose ticket the fix belongs to.
"""

from __future__ import annotations

import json
import re
import sqlite3

import pytest

from contracts.enums import (
    MissingEnumFamilyError,
    load_contract_enums,
    load_enum_map,
    placeholder_name,
    render_enum_check,
    render_enum_checks,
)
from contracts.paths import CONTRACTS_ENUM_EXPORT, INTERMEDIATE_SCHEMA_DIR
from contracts.schema import CORPUS_DDL_PATH, render_corpus_ddl
from corpus_seed import TS, seed_corpus

GAP = (
    "This is Q-CRPS-4, owned by FND-03 (packages/contracts — canonical enums and opaque ID "
    "conventions). Raise a ticket change against FND-03; CRPS-01 must not hand-copy enum values."
)

ENUM_MAP = load_enum_map()
GENERATED = ENUM_MAP["generated"]
PENDING = ENUM_MAP["pending"]

TEMPLATE_TEXT = CORPUS_DDL_PATH.read_text(encoding="utf-8")
RENDERED = render_corpus_ddl()


def test_the_contracts_enum_export_exists() -> None:
    assert CONTRACTS_ENUM_EXPORT.is_file(), (
        f"the packages/contracts enum export is missing at {CONTRACTS_ENUM_EXPORT}. {GAP}"
    )


@pytest.mark.parametrize("entry", GENERATED, ids=lambda e: f"{e['table']}.{e['column']}")
def test_generated_check_matches_the_contracts_export(entry: dict[str, str]) -> None:
    families = load_contract_enums()
    assert entry["family"] in families, (
        f"packages/contracts publishes no family {entry['family']!r} for "
        f"{entry['table']}.{entry['column']} (PRD {entry['prd']}). {GAP}"
    )
    expected = render_enum_check(
        entry["column"], families[entry["family"]], nullable=bool(entry.get("nullable", False))
    )
    assert expected in RENDERED, (
        f"the rendered DDL does not contain the generated CHECK for "
        f"{entry['table']}.{entry['column']}: expected {expected!r}"
    )


@pytest.mark.parametrize("entry", GENERATED, ids=lambda e: f"{e['table']}.{e['column']}")
def test_generated_check_list_equals_the_export_as_a_set(entry: dict[str, str]) -> None:
    """Set equality, so drift on EITHER side fails: a member added to or removed from
    `packages/contracts`, and equally a `CHECK` list edited by hand in the SQL."""
    rendered = render_enum_checks()[placeholder_name(entry["table"], entry["column"])]
    in_sql = set(re.findall(r"'([^']*)'", rendered))
    assert in_sql == set(load_contract_enums()[entry["family"]])


def test_the_ddl_template_contains_no_hand_written_enum_literal() -> None:
    """A quoted `IN ( ... )` list in the TEMPLATE would be a hand-written enum — a defect."""
    offenders = re.findall(r"IN\s*\(\s*'", TEMPLATE_TEXT)
    assert not offenders, (
        "001_corpus_schema.sql contains a hand-written quoted IN (...) list; every enum CHECK must "
        "arrive through a placeholder generated from packages/contracts (PRD §35.1)"
    )


def test_every_placeholder_is_covered_by_the_enum_map() -> None:
    in_template = set(re.findall(r"\$\{(enum_check_[a-z0-9_]+)\}", TEMPLATE_TEXT))
    in_map = {placeholder_name(entry["table"], entry["column"]) for entry in GENERATED + PENDING}
    assert in_template == in_map, (
        "every enumerated column must be explicitly `generated` or explicitly `pending` in "
        f"002_enums.map.json — template only: {sorted(in_template - in_map)}; "
        f"map only: {sorted(in_map - in_template)}"
    )


def test_the_rendered_ddl_has_no_unsubstituted_placeholder() -> None:
    assert "${" not in RENDERED and "$" not in RENDERED


@pytest.mark.parametrize("entry", PENDING, ids=lambda e: f"{e['table']}.{e['column']}")
def test_pending_columns_render_to_no_check_and_are_documented(entry: dict[str, str]) -> None:
    """A pending column is UNCONSTRAINED on purpose, and says so — it is never silently omitted."""
    assert render_enum_checks()[placeholder_name(entry["table"], entry["column"])] == ""
    assert entry["gap"] == "Q-CRPS-4 / FND-03"
    assert entry["prd"].startswith("§")


@pytest.mark.parametrize("entry", GENERATED, ids=lambda e: f"{e['table']}.{e['column']}")
def test_a_non_member_value_is_rejected_by_the_database(
    conn: sqlite3.Connection, entry: dict[str, str]
) -> None:
    seed_corpus(conn)
    statements = {
        ("document_version", "legal_status"): (
            "INSERT INTO document_version (id, document_id, source_artifact_id, version_label,"
            " effective_from, legal_status, retrieved_at, content_hash, official_url, created_at)"
            " VALUES ('dv_bad', 'doc_1', 'art_1', 'bad', '2026-07-01', 'NOT_A_STATUS', ?, ?, 'u', ?)"
        ),
        ("search_chunk", "index_tier"): (
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_bad', 'nv_1', 7, 0, 1,"
            " ?, 'NOT_A_TIER', ?)"
        ),
        ("licence_assessment", "status"): (
            "INSERT INTO licence_assessment (id, licence_snapshot_id, commercial_use, storage,"
            " indexing, embedding, display, quotation, export, prohibited_use, status,"
            " assessed_at, created_at) VALUES ('lass_bad', 'lsnap_1', 1, 1, 1, 1, 1, 1, 1, 0,"
            " 'NOT_A_STATE', ?, ?)"
        ),
        ("source", "coverage_status"): (
            "INSERT INTO source (id, source_group_id, name, authority_id, jurisdiction, base_url,"
            " adapter_key, coverage_status, freshness_status, created_at) VALUES ('src_bad',"
            " 'grp_bad', 'S', 'auth_1', 'AU-CTH', 'https://example.gov.au', 'a-bad',"
            " 'NOT_A_COVERAGE', 'CURRENT', ?)"
        ),
    }
    key = (entry["table"], entry["column"])
    assert key in statements, f"no negative probe for {key}; add one when a family is generated"
    parameters = {
        ("document_version", "legal_status"): (TS, "a" * 64, TS),
        ("search_chunk", "index_tier"): ("a" * 64, TS),
        ("licence_assessment", "status"): (TS, TS),
        ("source", "coverage_status"): (TS,),
    }[key]
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(statements[key], parameters)


def test_a_nullable_enum_column_accepts_null_but_still_rejects_a_non_member(
    conn: sqlite3.Connection,
) -> None:
    """`search_chunk.index_tier` is assigned by CRPS-04, so an untiered chunk must be writable.

    The two halves are asserted together on purpose: "nullable" must not become "unconstrained".
    """
    seed_corpus(conn)
    conn.execute(
        "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset, end_offset,"
        " text_hash, index_tier, created_at) VALUES ('chk_untiered', 'nv_1', 11, 0, 1, ?, NULL, ?)",
        ("b" * 64, TS),
    )
    stored = conn.execute(
        "SELECT index_tier FROM search_chunk WHERE id = 'chk_untiered'"
    ).fetchone()[0]
    assert stored is None
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES ('chk_wrong', 'nv_1', 12, 0, 1,"
            " ?, 'NOT_A_TIER', ?)",
            ("c" * 64, TS),
        )


def test_the_intermediate_legal_status_enum_matches_the_export() -> None:
    """The INR schema's `legal_status` enum is generated output, not a hand-typed list."""
    schema = json.loads(
        (INTERMEDIATE_SCHEMA_DIR / "document-version.schema.json").read_text(encoding="utf-8")
    )
    committed = schema["properties"]["legal_status"]["enum"]
    assert committed == list(load_contract_enums()["LegalStatus"])


def test_a_missing_family_raises_rather_than_skipping(monkeypatch: pytest.MonkeyPatch) -> None:
    """The mechanism itself is tested: an absent family must FAIL, naming Q-CRPS-4 and FND-03."""
    monkeypatch.setattr("contracts.enums.load_contract_enums", lambda: {"Other": ("A",)})
    with pytest.raises(MissingEnumFamilyError) as caught:
        render_enum_checks()
    assert "Q-CRPS-4" in str(caught.value) and "FND-03" in str(caught.value)
