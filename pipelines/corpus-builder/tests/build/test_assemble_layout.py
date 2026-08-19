"""The assembled bundle is exactly PRD §18.4's five entries, and it verifies."""

from __future__ import annotations

import json
from typing import Callable

from candidate_fixtures import Candidate
from candidate_paths import SRC  # noqa: F401

from build import assemble_bundle
from manifest import PRD_BUNDLE_PATHS, public_keys_from, verify_bundle


def test_a_good_candidate_builds_and_verifies(
    candidate_factory: Callable[..., Candidate], trusted_keys: dict[str, bytes]
) -> None:
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.decision == "BUILT", [
        finding.to_dict()
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.severity == "BLOCKING"
    ]
    assert outcome.bundle_dir == candidate.request().final_dir
    report = verify_bundle(outcome.bundle_dir, public_keys=trusted_keys)
    assert report.ok, [finding.code for finding in report.blocking()]


def test_the_bundle_holds_exactly_the_five_prd_entries_and_no_model_weight(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.bundle_dir is not None
    top_level = sorted(
        entry.name + ("/" if entry.is_dir() else "") for entry in outcome.bundle_dir.iterdir()
    )
    assert top_level == sorted(PRD_BUNDLE_PATHS)


def test_the_reports_are_siblings_of_the_bundle_never_inside_it(
    candidate_factory: Callable[..., Candidate], trusted_keys: dict[str, bytes]
) -> None:
    """Written inside, they would either change `artifacts.*` or be `BUNDLE_FILE_UNLISTED`."""
    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.bundle_dir is not None
    assert outcome.gate_report_path.parent == outcome.bundle_dir.parent
    assert outcome.release_diff_path.parent == outcome.bundle_dir.parent
    assert outcome.gate_report_path.is_file() and outcome.release_diff_path.is_file()
    report = verify_bundle(outcome.bundle_dir, public_keys=trusted_keys)
    assert "BUNDLE_FILE_UNLISTED" not in report.codes()


def test_all_eight_gates_appear_in_the_report(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from validation.codes import GATE_NAMES

    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    document = json.loads(outcome.gate_report_path.read_text(encoding="utf-8"))
    assert [entry["gate"] for entry in document["gates"]] == list(GATE_NAMES)
    assert document["decision"] == "BUILT"
    assert document["blocking_count"] == 0
    assert document["measurements"]["corpus_sqlite_bytes"] > 0
    assert document["measurements"]["lexical_index_bytes"] > 0
    assert document["measurements"]["vector_index_bytes"] > 0
    assert document["measurements"]["peak_rss_source"]


def test_the_manifest_records_the_index_builder_s_own_version(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """`versions.index` comes from the index builder's report, never from the request."""
    from candidate_fixtures import FixtureLexicalIndexBuilder

    candidate = candidate_factory()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.bundle_dir is not None
    manifest = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert manifest["versions"]["index"] == FixtureLexicalIndexBuilder.index_version
    assert manifest["release_kind"] == "CANDIDATE"
    assert manifest["signature"] is not None


def test_a_second_build_of_one_release_id_is_refused(
    candidate_factory: Callable[..., Candidate]
) -> None:
    from build import FinalPathExists

    import pytest

    candidate = candidate_factory()
    assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    with pytest.raises(FinalPathExists):
        assemble_bundle(candidate.request(), index_builder=candidate.index_builder())


def test_a_synthetic_fixture_may_use_the_null_index_builder(
    candidate_factory: Callable[..., Candidate], trusted_keys: dict[str, bytes]
) -> None:
    from build import NullLexicalIndexBuilder

    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE")
    outcome = assemble_bundle(
        candidate.request(release_kind="SYNTHETIC_FIXTURE"),
        index_builder=NullLexicalIndexBuilder(reason="fixture build"),
    )
    assert outcome.decision == "BUILT", [
        finding.to_dict()
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.severity == "BLOCKING"
    ]
    assert outcome.bundle_dir is not None
    manifest = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    # A null index version travels as the declared sentinel: `versions.index` is a NON-EMPTY STRING
    # in the schema, and a null would fail the bundle's own verification.
    assert manifest["versions"]["index"] == "PLACEHOLDER_NO_INDEX"
    state = json.loads(
        (outcome.bundle_dir / "tantivy" / "INDEX_STATE.json").read_text(encoding="utf-8")
    )
    assert state["state"] == "ABSENT"
    assert verify_bundle(outcome.bundle_dir, public_keys=trusted_keys).ok
