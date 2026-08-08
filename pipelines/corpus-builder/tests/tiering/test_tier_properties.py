"""Property tests — CRPS-04 acceptance items 2, 8 and 10 (rule 3.7, reason integrity, fail-closed).

NO HYPOTHESIS. The ticket's test-plan step 2 names Hypothesis, but no third-party package is
importable in this environment: a uv workspace member declared `package = false` contributes nothing
to the environment CI builds with `uv sync --frozen`, so a member dependency would degrade the
property test to `pytest.importorskip("hypothesis")` — a criterion that silently skips, which is
worse than no criterion (the CRPS-01 precedent rejects exactly that: "Deliberately an error and
never a skip"). See the CRPS-04 build report; the environment fix belongs to `FND-01`.

The replacement is strictly stronger than sampling here, because the decision-relevant domain is
finite and small:

* an EXHAUSTIVE `itertools.product` over all 576 decision-relevant inputs, and
* a SEEDED, deterministic fuzz over the fields the policy must ignore.
"""

from __future__ import annotations

import itertools
import random
from dataclasses import replace

import pytest
from conftest import INITIAL_TIERS, MAPPED, make_input
from tiering import (
    REASON_CODES,
    RULE_IDS,
    IndexTier,
    InvalidTieringInput,
    LicenceStatus,
    TieringError,
    TieringInput,
    UnknownLicenceState,
    UnknownSourceTier,
    assign_tier,
    tier_rank,
)

FUZZ_SEED = 20260808
"""A fixed seed: this is a deterministic replacement for Hypothesis, so a red run must reproduce."""

FUZZ_CASES = 500
"""Cases for the irrelevance fuzz. The decision-relevant space is covered exhaustively instead."""


def _decision_relevant_domain() -> list[TieringInput]:
    """All 3 x 6 x 2 x 2 x 2 x 2 = 576 inputs that can change a decision."""
    inputs: list[TieringInput] = []
    for initial, status, storage, indexing, embedding, quarantine, evidence in itertools.product(
        INITIAL_TIERS,
        list(LicenceStatus),
        (True, False),
        (True, False),
        (True, False),
        (True, False),
        (True, False),
    ):
        inputs.append(
            make_input(
                source_initial_tier=initial,
                licence_status=status,
                licence_permits_storage=storage,
                licence_permits_indexing=indexing,
                licence_permits_embedding=embedding,
                quarantine_open=quarantine,
                is_evidence_bearing=evidence,
            )
        )
    return inputs


DOMAIN = _decision_relevant_domain()


def test_the_domain_is_exhaustive() -> None:
    assert len(DOMAIN) == 3 * 6 * 2 * 2 * 2 * 2 * 2
    assert len(DOMAIN) == 576


def test_assign_tier_is_total_over_the_whole_domain() -> None:
    """Acceptance item 10: no input in the decision space raises."""
    for inp in DOMAIN:
        assign_tier(inp)


def test_no_input_can_upgrade_a_tier() -> None:
    """Acceptance item 2 / rule 3.7 (PRD §40.1) — the load-bearing property."""
    for inp in DOMAIN:
        base = MAPPED[str(inp.source_initial_tier)]
        decision = assign_tier(inp)
        assert tier_rank(decision.tier) <= tier_rank(base), (
            f"{inp} was upgraded from {base.value} to {decision.tier.value}"
        )


def test_every_decision_carries_a_declared_reason_and_rule() -> None:
    """Acceptance item 8 — a non-empty reason drawn from the exported constant set."""
    for inp in DOMAIN:
        decision = assign_tier(inp)
        assert decision.reason_code
        assert decision.reason_code in REASON_CODES
        assert decision.applied_rule in RULE_IDS
        assert isinstance(decision.tier, IndexTier)


def test_downgraded_from_is_set_exactly_when_a_downgrade_occurred() -> None:
    """Acceptance item 8's second half — and never a tier the chunk never held."""
    for inp in DOMAIN:
        base = MAPPED[str(inp.source_initial_tier)]
        decision = assign_tier(inp)
        if decision.tier is base:
            assert decision.downgraded_from is None
        else:
            assert decision.downgraded_from is base


def test_every_reason_code_is_reachable() -> None:
    """A reason nothing can emit is a documentation lie; the 576 inputs must cover all eight."""
    emitted = {assign_tier(inp).reason_code for inp in DOMAIN}
    assert emitted == set(REASON_CODES)


def test_every_rule_is_reachable() -> None:
    emitted = {assign_tier(inp).applied_rule for inp in DOMAIN}
    assert emitted == set(RULE_IDS)


def test_decisions_are_deterministic() -> None:
    """The same input twice gives an equal decision — no clock, no RNG, no shared cache."""
    for inp in DOMAIN:
        assert assign_tier(inp) == assign_tier(inp)


def test_evidence_bearing_text_is_never_worse_than_structural_text() -> None:
    """Rule 6 may only reduce, and only non-evidence-bearing material (PRD §17.2)."""
    for inp in DOMAIN:
        if not inp.is_evidence_bearing:
            continue
        structural = replace(inp, is_evidence_bearing=False)
        assert tier_rank(assign_tier(inp).tier) >= tier_rank(assign_tier(structural).tier)


# ------------------------------------------------------------------ the irrelevance fuzz (item 11)
_IRRELEVANT_GROUPS = ("grp_test_1", "grp_test_2", "grp_test_3", "grp_test_4")
_IRRELEVANT_DOC_TYPES = ("legislation", "decision", "guidance", "award", "explanatory_memorandum")
_IRRELEVANT_LEGAL_STATUSES = ("IN_FORCE", "REPEALED", "SUPERSEDED", "STATUS_UNCONFIRMED")
_IRRELEVANT_CHAR_COUNTS = (0, 1, 42, 999, 150_000, 300_000, 2_000_000_000)


def test_irrelevant_fields_are_exhaustively_irrelevant_over_the_whole_domain() -> None:
    """Every one of the 576 decisions is unchanged when all four ignored fields change together."""
    for inp in DOMAIN:
        baseline = assign_tier(inp)
        varied = replace(
            inp,
            source_group_id="grp_test_other",
            document_type="explanatory_memorandum",
            legal_status="REPEALED",
            node_char_count=300_000,
        )
        assert assign_tier(varied) == baseline


def test_fields_outside_the_policy_can_never_change_a_decision() -> None:
    """A character-count (or document-type, or legal-status) threshold cannot hide anywhere.

    This is the behavioural half of acceptance item 11: even if a budget-shaped constant escaped the
    source scan, it could not influence a decision without failing here. `150_000` and `300_000` are
    the deferred breakdown-plan §8 hot-vector planning hypothesis, included on purpose.
    """
    rng = random.Random(FUZZ_SEED)
    for case in range(FUZZ_CASES):
        fixed = {
            "source_initial_tier": rng.choice(INITIAL_TIERS),
            "licence_status": rng.choice(list(LicenceStatus)),
            "licence_permits_storage": rng.choice([True, False]),
            "licence_permits_indexing": rng.choice([True, False]),
            "licence_permits_embedding": rng.choice([True, False]),
            "quarantine_open": rng.choice([True, False]),
            "is_evidence_bearing": rng.choice([True, False]),
        }
        baseline = assign_tier(make_input(**fixed))
        group = rng.choice(_IRRELEVANT_GROUPS)
        doc_type = rng.choice(_IRRELEVANT_DOC_TYPES)
        legal_status = rng.choice(_IRRELEVANT_LEGAL_STATUSES)
        char_count = rng.choice(_IRRELEVANT_CHAR_COUNTS)
        varied = assign_tier(
            make_input(
                **fixed,
                source_group_id=group,
                document_type=doc_type,
                legal_status=legal_status,
                node_char_count=char_count,
            )
        )
        assert varied == baseline, (
            f"seed={FUZZ_SEED}, case {case}: a decision changed with group={group!r}, "
            f"document_type={doc_type!r}, legal_status={legal_status!r}, "
            f"node_char_count={char_count}"
        )


# ------------------------------------------------------------------------- fail closed (item 10)
@pytest.mark.parametrize(
    "bad_status",
    ["PERMITED", "", None, "permitted", "Permitted", "UNKNOWN", 0, True, ["PERMITTED"]],
    ids=lambda value: repr(value),
)
def test_unknown_licence_state_raises(bad_status: object) -> None:
    """PRD §11.1 / §12.2 — never a silent default to PERMITTED."""
    with pytest.raises(UnknownLicenceState) as excinfo:
        assign_tier(make_input(licence_status=bad_status))
    assert isinstance(excinfo.value, TieringError)


@pytest.mark.parametrize(
    "field",
    ["licence_permits_storage", "licence_permits_indexing", "licence_permits_embedding"],
)
@pytest.mark.parametrize("bad_value", [None, "true", 1, 0, "", "False"], ids=lambda v: repr(v))
def test_an_unassessed_permit_decision_raises(field: str, bad_value: object) -> None:
    """`None` means "not assessed" (PRD §11.1 requires each decision to be stated)."""
    with pytest.raises(UnknownLicenceState) as excinfo:
        assign_tier(make_input(**{field: bad_value}))
    assert isinstance(excinfo.value, TieringError)


@pytest.mark.parametrize(
    "bad_tier", ["T4", "t1", "", None, "T0", "TIER_1_FULL_SEMANTIC", 1], ids=lambda v: repr(v)
)
def test_unknown_source_tier_raises(bad_tier: object) -> None:
    """PRD §40.1 — never defaults to T1."""
    with pytest.raises(UnknownSourceTier) as excinfo:
        assign_tier(make_input(source_initial_tier=bad_tier))
    assert isinstance(excinfo.value, TieringError)


@pytest.mark.parametrize("bad_value", [None, "yes", 1, 0], ids=lambda v: repr(v))
def test_a_non_boolean_evidence_flag_raises(bad_value: object) -> None:
    with pytest.raises(InvalidTieringInput):
        assign_tier(make_input(is_evidence_bearing=bad_value))


@pytest.mark.parametrize("bad_value", [None, "yes", 1, 0], ids=lambda v: repr(v))
def test_a_non_boolean_quarantine_flag_raises(bad_value: object) -> None:
    with pytest.raises(InvalidTieringInput):
        assign_tier(make_input(quarantine_open=bad_value))


@pytest.mark.parametrize("bad_value", [-1, -150_000, "512", None, 1.5], ids=lambda v: repr(v))
def test_an_invalid_char_count_raises(bad_value: object) -> None:
    with pytest.raises(InvalidTieringInput):
        assign_tier(make_input(node_char_count=bad_value))


def test_a_failure_returns_no_tier_at_all() -> None:
    """Acceptance item 10: a fail-closed path must raise, never return a permissive tier."""
    for bad in (
        {"licence_status": None},
        {"licence_status": "PERMITED"},
        {"licence_permits_storage": None},
        {"source_initial_tier": "T4"},
    ):
        with pytest.raises(TieringError):
            assign_tier(make_input(**bad))
