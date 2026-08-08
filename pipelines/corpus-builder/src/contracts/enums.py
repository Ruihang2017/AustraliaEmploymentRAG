"""Generation of the corpus DDL's enum `CHECK` lists from the `packages/contracts` export.

PRD §35.1: *"Enumerations use checked text values generated from `packages/contracts`."* This module
is the generator. Nothing here contains an enum member literal — every value is read from
`paths.CONTRACTS_ENUM_EXPORT` at render time, so a change on either side is a test failure rather
than a silent divergence (`tests/schema/test_enum_drift.py`).

Columns for which `packages/contracts` publishes no family yet are declared `pending` in
`schema/corpus/002_enums.map.json` and render to the empty string. Hand-copying their values here
would defeat the whole mechanism; the fix is an `FND-03` ticket change (Q-CRPS-4).
"""

from __future__ import annotations

import json
from typing import Any

from .paths import CONTRACTS_ENUM_EXPORT, CORPUS_SCHEMA_DIR

__all__ = [
    "ENUM_MAP_PATH",
    "MissingEnumFamilyError",
    "enum_values",
    "load_contract_enums",
    "load_enum_map",
    "placeholder_name",
    "render_enum_check",
    "render_enum_checks",
]

ENUM_MAP_PATH = CORPUS_SCHEMA_DIR / "002_enums.map.json"

_GAP = (
    "This is the Q-CRPS-4 gap owned by FND-03 (packages/contracts — canonical enums). Raise a "
    "ticket change against FND-03; do NOT hand-copy enum values into this repository's SQL, "
    "JSON Schemas or Python (CRPS-01 Feedback obligation)."
)


class MissingEnumFamilyError(RuntimeError):
    """Raised when the `packages/contracts` export is absent or lacks a required family.

    Deliberately an error and never a skip: CRPS-01's test plan step 4 requires the drift test to
    FAIL, naming Q-CRPS-4 and FND-03, rather than pass vacuously.
    """


def load_contract_enums() -> dict[str, tuple[str, ...]]:
    """Return `{family_name: (member, ...)}` from the canonical `packages/contracts` export."""
    if not CONTRACTS_ENUM_EXPORT.is_file():
        raise MissingEnumFamilyError(
            f"the packages/contracts enum export is missing at {CONTRACTS_ENUM_EXPORT}. {_GAP}"
        )
    document: Any = json.loads(CONTRACTS_ENUM_EXPORT.read_text(encoding="utf-8"))
    families = document.get("families")
    if not isinstance(families, dict):
        raise MissingEnumFamilyError(
            f"{CONTRACTS_ENUM_EXPORT} has no `families` object. {_GAP}"
        )
    result: dict[str, tuple[str, ...]] = {}
    for name, body in families.items():
        values = body.get("values") if isinstance(body, dict) else None
        if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
            raise MissingEnumFamilyError(
                f"{CONTRACTS_ENUM_EXPORT}: family {name!r} has no string `values` list. {_GAP}"
            )
        result[name] = tuple(values)
    return result


def enum_values(family: str) -> tuple[str, ...]:
    """Return the members of *family*, in the export's declared order."""
    families = load_contract_enums()
    if family not in families:
        raise MissingEnumFamilyError(
            f"packages/contracts publishes no enum family {family!r} "
            f"(available: {', '.join(sorted(families))}). {_GAP}"
        )
    return families[family]


def load_enum_map() -> dict[str, list[dict[str, str]]]:
    """Return the `generated` / `pending` arrays of `schema/corpus/002_enums.map.json`."""
    document = json.loads(ENUM_MAP_PATH.read_text(encoding="utf-8"))
    return {
        "generated": list(document.get("generated", [])),
        "pending": list(document.get("pending", [])),
    }


def placeholder_name(table: str, column: str) -> str:
    """The `string.Template` placeholder for one enumerated column."""
    return f"enum_check_{table}_{column}"


def render_enum_check(column: str, values: tuple[str, ...]) -> str:
    """Render one `CHECK (<column> IN (...))` clause.

    A member containing a single quote would require SQL escaping that would also make the drift
    comparison ambiguous; the canonical vocabulary is `SCREAMING_SNAKE_CASE`, so such a member is
    rejected loudly rather than escaped quietly.
    """
    if not values:
        raise MissingEnumFamilyError(f"refusing to render an empty enum CHECK for {column!r}. {_GAP}")
    for value in values:
        if "'" in value or "\\" in value:
            raise MissingEnumFamilyError(
                f"enum member {value!r} for column {column!r} contains a quote or backslash; the "
                "canonical vocabulary must be quote-free."
            )
    rendered = ", ".join(f"'{value}'" for value in values)
    return f"CHECK ({column} IN ({rendered}))"


def render_enum_checks() -> dict[str, str]:
    """Return every `${enum_check_*}` substitution for the corpus DDL template.

    `generated` columns get a full `CHECK (...)` clause built from the `packages/contracts` export;
    `pending` columns get the empty string, leaving the column as plain `TEXT`.
    """
    enum_map = load_enum_map()
    families = load_contract_enums()
    substitutions: dict[str, str] = {}

    for entry in enum_map["generated"]:
        table, column, family = entry["table"], entry["column"], entry["family"]
        if family not in families:
            raise MissingEnumFamilyError(
                f"schema/corpus/002_enums.map.json maps {table}.{column} to enum family "
                f"{family!r}, which packages/contracts does not publish. {_GAP}"
            )
        substitutions[placeholder_name(table, column)] = render_enum_check(column, families[family])

    for entry in enum_map["pending"]:
        substitutions[placeholder_name(entry["table"], entry["column"])] = ""

    return substitutions
