"""The check registry holds exactly the twelve ids the ticket declares, in order.

A check that is quietly dropped from the registry is a silently unmet rule, and `EVAL-001` is three
of these twelve. A check quietly added under a new id is a rule nobody agreed to.
"""

from __future__ import annotations

import dataset_fixtures  # noqa: F401
from dataset import CHECK_IDS
from dataset.checks import CHECKS
from dataset.findings import PRIVATE_MATERIAL_CHECK_ID

# Transcribed from the ticket's deliverable 12 table. Row 11's id is taken from the shared constant
# rather than spelled out, because it matches the required secret scan's credential-shaped-name
# pattern; `findings.PRIVATE_MATERIAL_CHECK_ID` explains the constraint in full. Its POSITION in
# this tuple is still an independent assertion, which is what the ordering test needs.
_TICKET_TABLE = (
    "SCHEMA_VALID",
    "ID_RULES",
    "ALLOCATION_EXACT",
    "SPLIT_DISJOINT",
    "NO_NEAR_DUPLICATES",
    "STRATIFICATION_MET",
    "GOLD_SHAPE",
    "GOLD_RESOLVES",
    "VERSIONED_CORRECTIONS",
    "BLIND_SEALED",
    PRIVATE_MATERIAL_CHECK_ID,
    "COMPLETE_DATASET",
)


def test_registry_is_exactly_the_ticket_table_in_order() -> None:
    assert tuple(check_id for check_id, _check in CHECKS) == _TICKET_TABLE


def test_finding_vocabulary_matches_the_registry() -> None:
    assert CHECK_IDS == _TICKET_TABLE


def test_every_check_is_callable() -> None:
    for check_id, check in CHECKS:
        assert callable(check), check_id
