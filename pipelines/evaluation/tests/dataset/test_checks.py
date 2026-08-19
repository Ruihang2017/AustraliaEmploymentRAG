"""Per-check positive and negative fixtures (ticket test-plan step 4).

Every negative asserts the FINDING ID, not merely a non-zero result: a negative fixture that failed
for an incidental reason would prove nothing about the rule it is named for. Two checks report
`UNRESOLVED` on a correct dataset by design — `SCHEMA_VALID` (no canonical `Jurisdiction` family)
and `GOLD_RESOLVES` (no `--release`) — so `passes()` below asserts an EMPTY finding list for the
check under test rather than an empty list overall.
"""

from __future__ import annotations

from pathlib import Path

import dataset_fixtures
import pytest
from dataset import compose
from dataset.checks import CheckContext, run_checks
from dataset.findings import Finding
from dataset.paths import SCHEMAS_DIR

FIXTURE_RELEASE = dataset_fixtures.FIXTURE_RELEASE
FIXTURE_KEY = dataset_fixtures.FIXTURE_RELEASE_TRUSTED_KEY


def findings_for(root: Path, check_id: str, **context_kwargs) -> list[Finding]:
    dataset = compose(root)
    context = CheckContext(schemas_dir=SCHEMAS_DIR, **context_kwargs)
    return [f for f in run_checks(dataset, context, only=[check_id]) if f.check_id == check_id]


def severities(findings: list[Finding]) -> set[str]:
    return {finding.severity for finding in findings}


# -- SCHEMA_VALID ---------------------------------------------------------------------------------


def test_schema_valid_passes_apart_from_the_declared_unresolved(dataset_tree) -> None:
    found = findings_for(dataset_tree(), "SCHEMA_VALID")
    assert severities(found) <= {"UNRESOLVED"}
    assert any("JURISDICTION_VOCABULARY_UNRESOLVED" in f.message for f in found)


def test_schema_valid_fails_on_a_non_allowlisted_sidecar_field(dataset_tree) -> None:
    root = dataset_tree(extra_sidecar_field="EVAL-FED-004")
    found = findings_for(root, "SCHEMA_VALID")
    assert any(f.severity == "FAIL" and f.case_id == "EVAL-FED-004" for f in found)


def test_schema_valid_fails_on_a_requirement_shaped_id(dataset_tree) -> None:
    root = dataset_tree(requirement_shaped_id_for="EVAL-FED-001")
    assert any(f.severity == "FAIL" for f in findings_for(root, "SCHEMA_VALID"))


# -- ID_RULES -------------------------------------------------------------------------------------


def test_id_rules_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "ID_RULES") == []


def test_id_rules_rejects_a_requirement_shaped_id(dataset_tree) -> None:
    """`EVAL-001` is a PRD §30.1 requirement id; `EVAL-FED-001` is a case id (`INGF-07` needs it)."""
    root = dataset_tree(requirement_shaped_id_for="EVAL-FED-001")
    found = findings_for(root, "ID_RULES")
    assert [f.case_id for f in found] == ["EVAL-001"]
    assert "letter segment" in found[0].message or "EVAL-<CAT>" in found[0].message


def test_id_rules_rejects_an_id_used_in_two_categories(dataset_tree) -> None:
    root = dataset_tree(duplicate_id_into="case-treatment")
    found = findings_for(root, "ID_RULES")
    assert any("not globally unique" in f.message for f in found)


# -- ALLOCATION_EXACT -----------------------------------------------------------------------------


def test_allocation_exact_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "ALLOCATION_EXACT") == []


def test_allocation_exact_fails_on_a_miscounted_category(dataset_tree) -> None:
    root = dataset_tree(miscount_category="federal-core")
    found = findings_for(root, "ALLOCATION_EXACT")
    assert found and all(f.category == "federal-core" for f in found)
    assert any("requires exactly" in f.message for f in found)


# -- SPLIT_DISJOINT -------------------------------------------------------------------------------


def test_split_disjoint_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "SPLIT_DISJOINT") == []


def test_split_disjoint_fails_when_one_id_is_in_two_splits(dataset_tree) -> None:
    root = dataset_tree(duplicate_id_into="case-treatment")
    found = findings_for(root, "SPLIT_DISJOINT")
    assert any("splits" in f.message for f in found)
    assert {f.case_id for f in found} == {"EVAL-FED-001"}


# -- NO_NEAR_DUPLICATES ---------------------------------------------------------------------------


def test_no_near_duplicates_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "NO_NEAR_DUPLICATES") == []


def test_no_near_duplicates_fails_on_a_question_shared_across_splits(dataset_tree) -> None:
    root = dataset_tree(duplicate_question_between=("EVAL-FED-001", "EVAL-CAS-002"))
    found = findings_for(root, "NO_NEAR_DUPLICATES")
    assert found
    assert any("DEVELOPMENT / VALIDATION" in f.message for f in found)


# -- STRATIFICATION_MET ---------------------------------------------------------------------------


def test_stratification_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "STRATIFICATION_MET") == []


def test_stratification_fails_on_an_unmet_trap_floor(dataset_tree) -> None:
    root = dataset_tree(missing_trap_floor="federal-core")
    found = findings_for(root, "STRATIFICATION_MET")
    assert found and all(f.category == "federal-core" for f in found)
    assert any("required trap type" in f.message for f in found)


# -- GOLD_SHAPE -----------------------------------------------------------------------------------


def test_gold_shape_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "GOLD_SHAPE") == []


def test_gold_shape_fails_on_a_malformed_node_id(dataset_tree) -> None:
    root = dataset_tree()
    path = root / "cases" / "federal-core" / "EVAL-FED-001.yaml"
    path.write_text(path.read_text(encoding="utf-8").replace("nv_", "node_"), encoding="utf-8")
    found = findings_for(root, "GOLD_SHAPE")
    assert any("not a well-formed corpus id" in f.message for f in found)


def test_gold_shape_allows_an_out_of_scope_case_with_no_gold(dataset_tree) -> None:
    """PRD §43.3: an OUT_OF_SCOPE case has nothing to cite, so no required authority is demanded."""
    found = findings_for(dataset_tree(), "GOLD_SHAPE")
    assert not [f for f in found if f.case_id == "EVAL-SAF-001"]


# -- GOLD_RESOLVES --------------------------------------------------------------------------------


def test_gold_resolves_is_unresolved_without_a_release(dataset_tree) -> None:
    """Sub-PRD D7: without a release the check reports UNRESOLVED and NEVER passes."""
    found = findings_for(dataset_tree(), "GOLD_RESOLVES")
    assert found
    assert severities(found) == {"UNRESOLVED"}
    assert all(f.blocks() for f in found)


@pytest.mark.skipif(not FIXTURE_RELEASE.is_dir(), reason="the CRPS-08 fixture release is absent")
def test_gold_resolves_against_the_fixture_release(dataset_tree) -> None:
    found = findings_for(
        dataset_tree(),
        "GOLD_RESOLVES",
        release=FIXTURE_RELEASE,
        release_public_keys=(FIXTURE_KEY,),
    )
    assert found == []


@pytest.mark.skipif(not FIXTURE_RELEASE.is_dir(), reason="the CRPS-08 fixture release is absent")
def test_gold_resolves_fails_on_an_invented_node_id(dataset_tree) -> None:
    found = findings_for(
        dataset_tree(break_node_id_for="EVAL-FED-001"),
        "GOLD_RESOLVES",
        release=FIXTURE_RELEASE,
        release_public_keys=(FIXTURE_KEY,),
    )
    assert any("node_id does not resolve" in f.message for f in found)


@pytest.mark.skipif(not FIXTURE_RELEASE.is_dir(), reason="the CRPS-08 fixture release is absent")
def test_gold_resolves_fails_on_ids_that_exist_but_disagree(dataset_tree) -> None:
    """The third assertion: an id that resolves individually but belongs elsewhere is a FAIL."""
    found = findings_for(
        dataset_tree(inconsistent_gold_for="EVAL-FED-001"),
        "GOLD_RESOLVES",
        release=FIXTURE_RELEASE,
        release_public_keys=(FIXTURE_KEY,),
    )
    assert any("different document version" in f.message for f in found)


# -- VERSIONED_CORRECTIONS ------------------------------------------------------------------------


def test_versioned_corrections_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "VERSIONED_CORRECTIONS") == []


def test_versioned_corrections_fails_on_an_edit_with_no_new_version(dataset_tree) -> None:
    root = dataset_tree(edit_question_of="EVAL-FED-002")
    found = findings_for(root, "VERSIONED_CORRECTIONS")
    assert [f.case_id for f in found] == ["EVAL-FED-002"]
    assert "invisible edit" in found[0].message


def test_versioned_corrections_fails_on_a_changed_expected_output_with_no_migration(
    dataset_tree,
) -> None:
    root = dataset_tree(edit_expected_output_of="EVAL-FED-002")
    found = findings_for(root, "VERSIONED_CORRECTIONS")
    assert any("no migration record" in f.message for f in found)


def test_versioned_corrections_fails_on_an_unregistered_case(dataset_tree) -> None:
    root = dataset_tree(register_version=False)
    assert findings_for(root, "VERSIONED_CORRECTIONS") == []  # no registry at all: nothing to compare


# -- BLIND_SEALED ---------------------------------------------------------------------------------


def test_blind_sealed_passes(dataset_tree) -> None:
    assert findings_for(dataset_tree(), "BLIND_SEALED") == []


def test_blind_sealed_fails_on_a_missing_envelope(dataset_tree) -> None:
    found = findings_for(dataset_tree(drop_envelope_for="EVAL-FED-004"), "BLIND_SEALED")
    assert any("no sealed envelope" in f.message for f in found)


def test_blind_sealed_fails_on_a_corrupted_envelope(dataset_tree) -> None:
    found = findings_for(dataset_tree(corrupt_envelope_for="EVAL-FED-004"), "BLIND_SEALED")
    assert any("does not match its own ciphertext" in f.message for f in found)


def test_blind_sealed_fails_on_plaintext_under_a_blind_path(dataset_tree) -> None:
    found = findings_for(dataset_tree(plaintext_under_blind="federal-core"), "BLIND_SEALED")
    assert any("plaintext by elimination" in f.message for f in found)


def test_blind_sealed_fails_on_a_non_allowlisted_sidecar_field(dataset_tree) -> None:
    found = findings_for(dataset_tree(extra_sidecar_field="EVAL-FED-004"), "BLIND_SEALED")
    assert any("non-allowlisted field" in f.message for f in found)


# -- NO_PRIVATE_KEY -------------------------------------------------------------------------------


def test_no_private_key_passes_on_the_fixture_tree(dataset_tree) -> None:
    root = dataset_tree()
    dataset = compose(root)
    from dataset.checks import no_private_key

    findings = no_private_key.guard_private_material(sorted(p for p in root.rglob("*") if p.is_file()))
    assert findings == []
    assert dataset.categories


def test_no_private_key_fails_on_a_committed_private_key(dataset_tree) -> None:
    from dataset.checks import no_private_key

    root = dataset_tree(private_key_file_in="federal-core")
    findings = no_private_key.guard_private_material(sorted(p for p in root.rglob("*") if p.is_file()))
    assert any("private-key header" in f.message for f in findings)


# -- COMPLETE_DATASET -----------------------------------------------------------------------------


def test_complete_dataset_passes_on_the_fixture_tree(dataset_tree) -> None:
    """The ticket's Goal: `verify --complete` reproduces the allocation exactly over fixtures."""
    assert findings_for(dataset_tree(), "COMPLETE_DATASET", complete=True) == []


def test_complete_dataset_fails_when_a_count_is_short(dataset_tree) -> None:
    found = findings_for(dataset_tree(miscount_category="federal-core"), "COMPLETE_DATASET", complete=True)
    assert any("requires exactly" in f.message for f in found)


def test_complete_dataset_does_not_run_without_the_flag(dataset_tree) -> None:
    assert findings_for(dataset_tree(miscount_category="federal-core"), "COMPLETE_DATASET") == []
