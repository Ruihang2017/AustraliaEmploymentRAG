"""The canonical enum families are READ from `packages/contracts`, never restated here.

PRD §45.2 forbids a duplicated rule and PRD §44.3 makes `packages/contracts` serial-owned, so a
schema in this ticket carries no member literal for a canonical family. These tests assert that the
export really is reachable, that a missing family is an ERROR rather than a skip, and that no file
this ticket owns hard-codes a member of a canonical family.
"""

from __future__ import annotations

import json

import dataset_fixtures  # noqa: F401
import pytest
from dataset import contract_enums
from dataset.paths import SCHEMAS_DIR


def test_answer_statuses_come_from_the_canonical_export() -> None:
    values = contract_enums.answer_statuses()
    assert "SUPPORTED" in values
    assert "OUT_OF_SCOPE" in values


def test_citation_roles_come_from_the_canonical_export() -> None:
    values = contract_enums.citation_roles()
    assert "SUPPORTS" in values
    assert "BACKGROUND_ONLY" in values


def test_a_missing_family_raises_rather_than_skipping() -> None:
    with pytest.raises(contract_enums.MissingEnumFamilyError):
        contract_enums.enum_values("NoSuchFamilyExistsHere")


def test_the_jurisdiction_family_is_still_absent_upstream() -> None:
    """The condition that makes `JURISDICTION_VOCABULARY_UNRESOLVED` honest.

    When `FND-03` publishes a `Jurisdiction` family this test fails, which is the intended signal to
    replace the shape check with a membership check. It must never be "fixed" by defining a second
    copy of the enum here (GOLD-01 Feedback obligation 2).
    """
    families = contract_enums.load_contract_enums()
    assert "Jurisdiction" not in families, (
        "FND-03 now publishes a Jurisdiction family: switch checks/schema_valid.py from the shape "
        "check to a membership check and drop the UNRESOLVED finding."
    )


def test_no_schema_restates_a_canonical_enum_member() -> None:
    canonical: set[str] = set()
    for family in ("AnswerStatus", "CitationRole", "LegalStatus", "ClaimSupport", "AuthorityLevel"):
        canonical.update(contract_enums.enum_values(family))
    for path in sorted(SCHEMAS_DIR.glob("*.schema.json")):
        document = json.dumps(json.loads(path.read_text(encoding="utf-8")))
        for member in canonical:
            assert f'"{member}"' not in document, (
                f"{path.name} restates the canonical enum member {member!r}; reference the family "
                "in a $comment and enforce membership from the export at check time instead"
            )
