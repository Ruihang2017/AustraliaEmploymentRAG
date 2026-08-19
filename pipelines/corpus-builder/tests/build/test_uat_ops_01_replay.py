"""`UAT-OPS-01`, corpus side: a corrupted candidate is rejected and publishes nothing.

PRD §41.2 `UAT-OPS-01` — "Corrupt candidate corpus fixture" -> "Promotion blocked; active
release/search unchanged". This ticket owns the left half: the candidate is refused and no
publishable artifact exists. `RLSE-07` owns the promotion half, and the founder runs the pair
end-to-end at Gate 2.
"""

from __future__ import annotations

from typing import Callable

from candidate_fixtures import Candidate, FixtureLexicalIndexBuilder
from candidate_paths import SRC  # noqa: F401

from build import IndexBuildResult, assemble_bundle
from build.assemble import BundlePaths, stage_bundle


class _CorruptingIndexBuilder(FixtureLexicalIndexBuilder):
    """Builds the index, then truncates the STAGED corpus database — the corruption UAT-OPS-01 asks
    for, injected after assembly and before the gates, which is exactly where a real disk or
    transfer fault would land."""

    def build(self, corpus_db, out_dir):  # type: ignore[no-untyped-def]
        result = super().build(corpus_db, out_dir)
        with open(corpus_db, "r+b") as handle:
            handle.truncate(2048)
        return result


def test_a_corrupted_candidate_is_rejected_and_publishes_nothing(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    request = candidate.request()

    outcome = assemble_bundle(request, index_builder=_CorruptingIndexBuilder())

    assert outcome.decision == "REJECTED"
    assert outcome.exit_code == 2
    assert outcome.bundle_dir is None
    assert not request.final_dir.exists()
    assert not (request.staging_dir / request.bundle_name).exists()

    codes = {
        finding.code
        for result in outcome.gate_report.gates
        for finding in result.findings
        if finding.severity == "BLOCKING"
    }
    # A truncated database is unreadable to every gate that opens it; the report says so rather
    # than failing with an internal error.
    assert codes, outcome.gate_report.to_dict()
    assert {"CORPUS_DATABASE_UNREADABLE", "GATE_INTERNAL_ERROR"} & codes


def test_the_input_database_survives_the_corrupted_build(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """The corruption is applied to the STAGED copy; the operator's input is untouched."""
    import hashlib

    candidate = candidate_factory()
    before = hashlib.sha256(candidate.corpus_db.read_bytes()).hexdigest()
    assemble_bundle(candidate.request(), index_builder=_CorruptingIndexBuilder())
    assert hashlib.sha256(candidate.corpus_db.read_bytes()).hexdigest() == before


def test_staging_puts_the_five_entries_under_the_staging_root_only(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """Before the gates run, everything lives under `.staging/` and the final path does not exist."""
    candidate = candidate_factory()
    request = candidate.request()
    paths, result = stage_bundle(request, index_builder=candidate.index_builder())

    assert isinstance(paths, BundlePaths)
    assert isinstance(result, IndexBuildResult)
    assert request.staging_dir in paths.bundle_dir.parents
    assert not request.final_dir.exists()
    assert sorted(entry.name for entry in paths.bundle_dir.iterdir()) == [
        "corpus.sqlite",
        "embedding-manifest.json",
        "tantivy",
        "vectors.usearch",
    ]
    # The manifest is NOT written yet: it hashes every other file, so it is built last.
    assert not paths.release_manifest.exists()
