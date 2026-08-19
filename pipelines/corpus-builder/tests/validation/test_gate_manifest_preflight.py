"""Gate 8, phase A — the pin preflight. Breakdown plan §8 Q11; CRPS-02 deliverables 12–13.

The full pinning matrix's *agreement* half (embedding-manifest disagreement, QUERY/DOCUMENT
representation mismatch, stub visibility in a written manifest) is `verify_bundle()`'s and is
asserted in `test_gate_manifest_verification.py` against a real built bundle. This module covers the
preflight: what must hold over the REQUEST for `build_release_manifest()` to run at all without
raising `ManifestIncomplete`, which the acceptance checklist requires to be a gate rejection.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Callable

from candidate_fixtures import (
    Candidate,
    FixtureLexicalIndexBuilder,
    fixture_document_pin,
    fixture_query_pin,
    fixture_runtime,
)

from build import IndexBuildResult, NullLexicalIndexBuilder, assemble_bundle
from manifest import Licence, ModelArtifact, Tokenizer
from validation.gates import gate_manifest_preflight


def _codes(findings: list) -> set[str]:
    return {finding.code for finding in findings}


def test_the_baseline_passes(candidate_factory: Callable[..., Candidate]) -> None:
    assert gate_manifest_preflight(candidate_factory().phase_a_context()) == []


def test_an_absent_runtime_pin_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory(runtime_pin=fixture_runtime())
    context = candidate.phase_a_context(request=candidate.request(runtime_pin=None))
    findings = gate_manifest_preflight(context)
    assert "MANIFEST_PIN_RUNTIME_ABSENT" in _codes(findings)
    assert all(finding.severity == "BLOCKING" for finding in findings)


def test_absent_model_pins_block(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    context = candidate.phase_a_context(request=candidate.request(local_model_pins=()))
    assert "MANIFEST_PIN_MODEL_PINS_ABSENT" in _codes(gate_manifest_preflight(context))


def test_a_missing_document_embedding_role_blocks(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    context = candidate.phase_a_context(
        request=candidate.request(local_model_pins=(fixture_query_pin(),))
    )
    assert "MANIFEST_PIN_DOCUMENT_ROLE_ABSENT" in _codes(gate_manifest_preflight(context))


def test_a_duplicated_role_blocks(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    context = candidate.phase_a_context(
        request=candidate.request(
            local_model_pins=(fixture_document_pin(), fixture_document_pin())
        )
    )
    assert "MANIFEST_PIN_MEMBER_INCOMPLETE" in _codes(gate_manifest_preflight(context))


def test_each_missing_pin_member_blocks_on_its_own(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """One case per member — an incomplete pin must never be silently completed."""
    candidate = candidate_factory()
    cases = {
        "model_revision": replace(fixture_document_pin(), model_revision=""),
        "dimensions": replace(fixture_document_pin(), dimensions=None),
        "normalisation": replace(fixture_document_pin(), normalisation=""),
        "truncation": replace(fixture_document_pin(), truncation=""),
        "max_tokens": replace(fixture_document_pin(), max_tokens=None),
        "model_artifact.sha256": replace(
            fixture_document_pin(),
            model_artifact=ModelArtifact(sha256="", byte_size=1, format="onnx"),
        ),
        "tokenizer.artifact_sha256": replace(
            fixture_document_pin(),
            tokenizer=Tokenizer(
                id="t", artifact_sha256="", max_tokens=512, truncation="RIGHT"
            ),
        ),
        "licence.identifier": replace(
            fixture_document_pin(),
            licence=Licence(
                identifier="",
                url=None,
                attribution_required=False,
                redistribution_permitted=False,
                notes=None,
            ),
        ),
    }
    for member, pin in cases.items():
        context = candidate.phase_a_context(
            request=candidate.request(local_model_pins=(pin,))
        )
        findings = gate_manifest_preflight(context)
        assert "MANIFEST_PIN_MEMBER_INCOMPLETE" in _codes(findings), member
        assert any(member.split(".")[-1] in finding.subject for finding in findings), member


def test_a_stub_pin_blocks_a_candidate(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE")
    for member, pin in (
        ("model_id", replace(fixture_document_pin(), model_id="stub:synthetic")),
        ("model_revision", replace(fixture_document_pin(), model_revision="stub")),
        (
            "tokenizer.id",
            replace(
                fixture_document_pin(),
                tokenizer=Tokenizer(
                    id="stub:no-tokenizer",
                    artifact_sha256="b" * 64,
                    max_tokens=512,
                    truncation="RIGHT",
                ),
            ),
        ),
    ):
        context = candidate.phase_a_context(
            request=candidate.request(local_model_pins=(pin,))
        )
        findings = gate_manifest_preflight(context)
        assert "MANIFEST_PIN_STUB_ON_CANDIDATE" in _codes(findings), member


def test_a_stub_runtime_family_blocks_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    context = candidate.phase_a_context(
        request=candidate.request(runtime_pin=replace(fixture_runtime(), family="stub:runtime"))
    )
    assert "MANIFEST_PIN_STUB_ON_CANDIDATE" in _codes(gate_manifest_preflight(context))


def test_a_stub_pin_is_permitted_on_a_synthetic_fixture(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE")
    context = candidate.phase_a_context(
        request=candidate.request(
            release_kind="SYNTHETIC_FIXTURE",
            local_model_pins=(replace(fixture_document_pin(), model_id="stub:synthetic"),),
            runtime_pin=replace(fixture_runtime(), family="stub:runtime"),
        )
    )
    assert "MANIFEST_PIN_STUB_ON_CANDIDATE" not in _codes(gate_manifest_preflight(context))


def test_a_null_lexical_index_builder_blocks_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE")
    context = candidate.phase_a_context(
        index_result=IndexBuildResult(
            index_version=None,
            file_count=1,
            byte_size=10,
            doc_count=0,
            builder_id=NullLexicalIndexBuilder.builder_id,
        )
    )
    findings = gate_manifest_preflight(context)
    assert "INDEX_BUILDER_NULL_ON_CANDIDATE" in _codes(findings)
    assert all(finding.severity == "BLOCKING" for finding in findings)


def test_a_null_equivalent_cannot_slip_through_by_renaming_itself(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """The check keys on `index_version is None` as well as on the builder's declared identity."""
    candidate = candidate_factory(release_kind="CANDIDATE")
    context = candidate.phase_a_context(
        index_result=IndexBuildResult(
            index_version=None,
            file_count=1,
            byte_size=10,
            doc_count=0,
            builder_id="an-innocent-sounding-builder",
        )
    )
    assert "INDEX_BUILDER_NULL_ON_CANDIDATE" in _codes(gate_manifest_preflight(context))


def test_an_index_that_reports_a_version_but_wrote_nothing_blocks_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """REGRESSION (reviewer, HIGH). The third, artifact-based leg of deliverable 3's guarantee.

    A builder that exits 0 and prints a plausible version while writing zero files is null by
    neither identity test, so the gate measures what was actually produced. `ExternalLexicalIndexBuilder`
    now refuses to return such a result, but the port is an extension point and the gate must not
    take an unknown builder's word for it.
    """
    candidate = candidate_factory(release_kind="CANDIDATE")
    context = candidate.phase_a_context(
        index_result=IndexBuildResult(
            index_version="9.9.9",
            file_count=0,
            byte_size=0,
            doc_count=0,
            builder_id="a-builder-that-wrote-nothing",
        )
    )
    findings = gate_manifest_preflight(context)
    assert "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE" in _codes(findings)
    empty = [f for f in findings if f.code == "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE"]
    assert empty[0].severity == "BLOCKING"
    assert empty[0].evidence["file_count"] == 0


def test_a_zero_byte_index_blocks_a_candidate_even_with_files_present(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE")
    context = candidate.phase_a_context(
        index_result=IndexBuildResult(
            index_version="9.9.9",
            file_count=3,
            byte_size=0,
            doc_count=0,
            builder_id="a-builder-that-wrote-empty-files",
        )
    )
    assert "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE" in _codes(gate_manifest_preflight(context))


class _LyingLexicalIndexBuilder:
    """A third-party builder that FABRICATES its own report: it writes nothing and claims an index.

    Deliberately not null by either identity test — it declares its own `builder_id` and a non-null
    `index_version` — so the only thing standing between it and a published candidate with an empty
    `tantivy/` is a measurement of the artifact itself.
    """

    builder_id = "a-third-party-builder-that-fabricates-its-report"

    def build(self, corpus_db, out_dir):  # type: ignore[no-untyped-def]
        out_dir.mkdir(parents=True, exist_ok=True)
        return IndexBuildResult(
            index_version="9.9.9",
            file_count=42,
            byte_size=123456,
            doc_count=7,
            builder_id=self.builder_id,
        )


def test_a_builder_that_fabricates_its_file_count_still_blocks_a_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """REGRESSION (reviewer, MEDIUM). The gate measures the staged `tantivy/`, not the report.

    Before this, `_index_builder_findings` read `IndexBuildResult.file_count`/`byte_size` — the
    builder's own account of itself — while its docstring claimed the guarantee held "for an
    implementation this module has never seen". A builder that returned a fabricated non-zero size
    without writing bytes therefore passed, and the candidate was published with an empty, unusable
    lexical index: exactly the failure mode deliverable 3 exists to prevent, reached by lying rather
    than by being null.
    """
    candidate = candidate_factory(release_kind="CANDIDATE")
    outcome = assemble_bundle(candidate.request(), index_builder=_LyingLexicalIndexBuilder())

    assert outcome.decision == "REJECTED"
    codes = {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
    }
    assert "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE" in codes
    empty = [
        finding
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.code == "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE"
    ]
    # The MEASURED figures are what the finding carries; the builder's claim is kept beside them so
    # an operator can see the divergence rather than having to infer it.
    assert empty[0].evidence["file_count"] == 0
    assert empty[0].evidence["byte_size"] == 0
    assert empty[0].evidence["reported_file_count"] == 42
    assert empty[0].evidence["reported_byte_size"] == 123456
    assert not (candidate.output_dir / f"corpus-release-{candidate.release_id}").exists()


def test_a_real_index_is_not_flagged_as_empty(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="CANDIDATE")
    findings = gate_manifest_preflight(candidate.phase_a_context())
    assert "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE" not in _codes(findings)
    assert "INDEX_BUILDER_NULL_ON_CANDIDATE" not in _codes(findings)


def test_an_empty_index_is_permitted_on_a_non_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE")
    context = candidate.phase_a_context(
        request=candidate.request(release_kind="SYNTHETIC_FIXTURE"),
        index_result=IndexBuildResult(
            index_version="9.9.9",
            file_count=0,
            byte_size=0,
            doc_count=0,
            builder_id="a-builder-that-wrote-nothing",
        ),
    )
    assert "INDEX_ARTIFACT_EMPTY_ON_CANDIDATE" not in _codes(gate_manifest_preflight(context))


def test_a_null_index_is_permitted_on_a_non_candidate(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory(release_kind="SYNTHETIC_FIXTURE")
    context = candidate.phase_a_context(
        request=candidate.request(release_kind="SYNTHETIC_FIXTURE"),
        index_result=IndexBuildResult(
            index_version=None,
            file_count=1,
            byte_size=10,
            doc_count=0,
            builder_id=NullLexicalIndexBuilder.builder_id,
        ),
    )
    assert "INDEX_BUILDER_NULL_ON_CANDIDATE" not in _codes(gate_manifest_preflight(context))


def test_a_real_index_builder_passes(candidate_factory: Callable[..., Candidate]) -> None:
    candidate = candidate_factory()
    context = candidate.phase_a_context(
        index_result=IndexBuildResult(
            index_version=FixtureLexicalIndexBuilder.index_version,
            file_count=2,
            byte_size=100,
            doc_count=3,
            builder_id=FixtureLexicalIndexBuilder.builder_id,
        )
    )
    assert gate_manifest_preflight(context) == []
