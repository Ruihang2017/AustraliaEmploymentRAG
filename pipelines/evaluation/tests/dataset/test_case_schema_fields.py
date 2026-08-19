"""Every PRD §43.2 field exists, the PRD §14.1 fields are required, an unknown field fails.

Acceptance item: "Every PRD §43.2 field name exists in the schema and the PRD §14.1 fields are
`required`; an unknown field fails validation (`additionalProperties: false`)."
"""

from __future__ import annotations

import json
from typing import Any

import dataset_fixtures
import pytest
from dataset import schema_engine
from dataset.paths import SCHEMAS_DIR

_PRD = json.loads((dataset_fixtures.DATA_DIR / "prd-43-2-fields.json").read_text(encoding="utf-8"))
_CASE = json.loads((SCHEMAS_DIR / "case.schema.json").read_text(encoding="utf-8"))
_GOLD = json.loads((SCHEMAS_DIR / "gold-authority.schema.json").read_text(encoding="utf-8"))
_SIDECAR = json.loads((SCHEMAS_DIR / "blind-sidecar.schema.json").read_text(encoding="utf-8"))


def valid_case() -> dict[str, Any]:
    """A minimal case that satisfies `case.schema.json`. Synthetic content only (sub-PRD D18)."""
    return {
        "id": "EVAL-FED-001",
        "dataset_version": "v1",
        "split": "DEVELOPMENT",
        "primary_category": "federal-core",
        "tags": ["SEARCH"],
        "product_surface": "ASK",
        "mode": "QUICK",
        "anonymous_scenario": "A synthetic employer engages a synthetic casual employee.",
        "question": "Does the synthetic employee accrue annual leave?",
        "legal_as_at": "2026-08-19",
        "jurisdictions": ["AU"],
        "expected_answer_status": "SUPPORTED",
        "acceptable_statuses": ["SUPPORTED", "CONDITIONAL"],
        "required_facts": ["employment type"],
        "prohibited_assumptions": ["that the employee is permanent"],
        "trap_types": ["classification"],
        "gold_authorities": [
            {
                "document_id": "doc_019fc4eb-9000-7dc3-94f9-322cef867fa2",
                "version_id": "dv_019fc4eb-9000-75d2-a447-262a960c6e32",
                "node_id": "nv_019fc4eb-9000-7f8c-9ff4-66be57bcfd4a",
                "citation_role": "SUPPORTS",
                "required": True,
            }
        ],
        "required_claims": ["casual employees do not accrue paid annual leave"],
        "optional_claims": [],
        "prohibited_claims": ["all employees accrue annual leave"],
        "latency_class": "STANDARD",
        "cost_class": "STANDARD",
        "author": "evaluation-author-agent",
        "reviewer": "evaluation-reviewer-agent",
        "change_reason": "initial authoring",
    }


@pytest.mark.parametrize("field", _PRD["caseFields"])
def test_every_prd_43_2_field_exists(field: str) -> None:
    assert field in _CASE["properties"], f"PRD §43.2 names {field!r} and case.schema.json omits it"


@pytest.mark.parametrize("field", _PRD["requiredByPrd141"])
def test_prd_14_1_fields_are_required(field: str) -> None:
    assert field in _CASE["required"]


@pytest.mark.parametrize("field", _PRD["optionalByNature"])
def test_optional_fields_are_not_required(field: str) -> None:
    assert field in _CASE["properties"]
    assert field not in _CASE["required"]


def test_precondition_members_are_the_prd_group() -> None:
    assert sorted(_CASE["properties"]["preconditions"]["properties"]) == sorted(
        _PRD["preconditionMembers"]
    )


@pytest.mark.parametrize("field", _PRD["goldAuthorityFields"])
def test_gold_authority_fields_are_exactly_the_prd_members(field: str) -> None:
    assert field in _GOLD["properties"]
    assert field in _GOLD["required"]


def test_sidecar_allowlist_is_exactly_the_ticket_list() -> None:
    assert sorted(_SIDECAR["properties"]) == sorted(_PRD["blindSidecarAllowlist"])
    assert sorted(_SIDECAR["required"]) == sorted(_PRD["blindSidecarAllowlist"])


def test_a_valid_case_validates() -> None:
    schema_engine.validator_for("case.schema.json").validate(valid_case())


def test_an_unknown_field_fails_validation() -> None:
    case = valid_case()
    case["invented_field"] = "anything"
    with pytest.raises(schema_engine.ValidationError):
        schema_engine.validator_for("case.schema.json").validate(case)


def test_a_missing_required_field_fails_validation() -> None:
    case = valid_case()
    del case["question"]
    with pytest.raises(schema_engine.ValidationError):
        schema_engine.validator_for("case.schema.json").validate(case)


def test_an_unknown_split_fails_validation() -> None:
    case = valid_case()
    case["split"] = "HOLDOUT"
    with pytest.raises(schema_engine.ValidationError):
        schema_engine.validator_for("case.schema.json").validate(case)


def test_a_requirement_shaped_id_fails_validation() -> None:
    """`EVAL-001` is a PRD §30.1 requirement id and can never be a case id (plan §1.1)."""
    case = valid_case()
    case["id"] = "EVAL-001"
    with pytest.raises(schema_engine.ValidationError):
        schema_engine.validator_for("case.schema.json").validate(case)


def test_a_node_id_with_the_documentnode_prefix_fails_validation() -> None:
    """PRD §15.3 pins citations to a NodeVersion (`nv_`), not a DocumentNode (`node_`)."""
    case = valid_case()
    case["gold_authorities"][0]["node_id"] = "node_019fc4eb-9000-7710-9c63-394d78882350"
    with pytest.raises(schema_engine.ValidationError):
        schema_engine.validator_for("case.schema.json").validate(case)


def test_additional_properties_is_false_at_every_object_level() -> None:
    """An unknown field must be a validation failure rather than silent data — everywhere."""

    # The one deliberate exception: PRD §43.2's `input_structured_fields` is an open bag of
    # surface inputs, so it cannot be an allowlist. It is optional and carries no expected output.
    free_form = "case.schema.json.properties.input_structured_fields"

    def walk(node: Any, where: str) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" and where != free_form:
                assert node.get("additionalProperties") is False, where
            for key, child in node.items():
                walk(child, f"{where}.{key}")
        elif isinstance(node, list):
            for index, child in enumerate(node):
                walk(child, f"{where}[{index}]")

    for name in schema_engine.SCHEMA_FILES:
        document = json.loads((SCHEMAS_DIR / name).read_text(encoding="utf-8"))
        walk(document, name)
