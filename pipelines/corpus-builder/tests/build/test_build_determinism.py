"""Two builds of one input reproduce identical artifact hashes.

`manifest_sha256` is deliberately NOT compared: it covers `build_started_at`, `build_finished_at`
and `created_at`, so a second build differs there by construction. `artifacts.*` is what determinism
means for a bundle's CONTENT.
"""

from __future__ import annotations

import json
from typing import Callable

from candidate_fixtures import Candidate
from candidate_paths import SRC  # noqa: F401

from build import assemble_bundle


def _artifacts(candidate: Candidate, suffix: str) -> dict[str, str]:
    request = candidate.request(output_dir=candidate.root / f"out-{suffix}")
    outcome = assemble_bundle(request, index_builder=candidate.index_builder())
    assert outcome.decision == "BUILT", outcome.gate_report.to_dict()
    assert outcome.bundle_dir is not None
    manifest = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    return manifest["artifacts"]


def test_two_builds_of_one_input_produce_identical_artifact_hashes(
    candidate_factory: Callable[..., Candidate]
) -> None:
    candidate = candidate_factory()
    first = _artifacts(candidate, "a")
    second = _artifacts(candidate, "b")
    assert first == second
    assert set(first) == {
        "corpus_sqlite_sha256",
        "lexical_index_sha256",
        "vector_index_sha256",
        "embedding_manifest_sha256",
    }


def test_the_staged_corpus_database_is_byte_identical_to_the_input(
    candidate_factory: Callable[..., Candidate]
) -> None:
    """It is copied with `shutil.copyfile` and never opened read-write, which is what makes the
    hash above stable across builds."""
    import hashlib

    candidate = candidate_factory()
    expected = hashlib.sha256(candidate.corpus_db.read_bytes()).hexdigest()
    outcome = assemble_bundle(candidate.request(), index_builder=candidate.index_builder())
    assert outcome.bundle_dir is not None
    actual = hashlib.sha256((outcome.bundle_dir / "corpus.sqlite").read_bytes()).hexdigest()
    assert actual == expected

    manifest = json.loads(
        (outcome.bundle_dir / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert manifest["artifacts"]["corpus_sqlite_sha256"] == expected
