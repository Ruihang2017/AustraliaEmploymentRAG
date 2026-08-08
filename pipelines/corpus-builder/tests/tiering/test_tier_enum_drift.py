"""The enum binding to `packages/contracts` (PRD §35.1 / sub-PRD D4), and the reason registry.

`tiers.py` declares `IndexTier` and `LicenceStatus` as static `StrEnum`s because a generated enum
cannot be type-checked, matched exhaustively, or used in the literal decision table that IS this
ticket's specification. This module is what makes that legitimate rather than a hand-copy: it
asserts tuple equality — member for member, IN ORDER — against the canonical export.

Like `tests/schema/test_enum_drift.py`, this suite FAILS and never skips if the export is missing:
`contracts.enums.MissingEnumFamilyError` propagates. A drift test that skips is not a test.
"""

from __future__ import annotations

from contracts.enums import enum_values
from tiering import (
    REASON_BASIS,
    REASON_CODES,
    RULE_IDS,
    IndexTier,
    LicenceStatus,
    assign_tier,
)

from test_tier_properties import DOMAIN


def test_index_tier_matches_the_canonical_export() -> None:
    """PRD §17.2, family `IndexTier`."""
    assert tuple(member.value for member in IndexTier) == enum_values("IndexTier")


def test_licence_status_matches_the_canonical_export() -> None:
    """PRD §11.1, family `LicenceAssessmentState`.

    The canonical family name is `LicenceAssessmentState`; the CRPS-04 ticket names the Python type
    `LicenceStatus` (deliverable 1) and the ticket is the source of truth for the type name. This
    assertion is the binding between the two.
    """
    assert tuple(member.value for member in LicenceStatus) == enum_values("LicenceAssessmentState")


def test_member_names_equal_their_values() -> None:
    """A `StrEnum` whose name and value diverge would make the DB-facing round trip ambiguous."""
    for member in IndexTier:
        assert member.name == member.value
    for member in LicenceStatus:
        assert member.name == member.value


def test_every_reason_code_declares_a_prd_basis() -> None:
    """Deliverable 8: every reason code names the PRD sentence it rests on."""
    assert set(REASON_BASIS) == set(REASON_CODES)
    for code, basis in REASON_BASIS.items():
        assert code, "a reason code must be non-empty"
        assert "PRD §" in basis, f"reason {code} has no PRD basis: {basis!r}"


def test_the_reason_and_rule_registries_are_read_only() -> None:
    import pytest

    with pytest.raises(TypeError):
        REASON_BASIS["INVENTED"] = "no basis"  # type: ignore[index]
    assert isinstance(REASON_CODES, frozenset)
    assert isinstance(RULE_IDS, frozenset)


def test_no_decision_can_emit_an_undeclared_reason() -> None:
    """Belt and braces with the property suite, from the registry's side."""
    for inp in DOMAIN:
        decision = assign_tier(inp)
        assert decision.reason_code in REASON_BASIS
        assert decision.applied_rule in RULE_IDS
