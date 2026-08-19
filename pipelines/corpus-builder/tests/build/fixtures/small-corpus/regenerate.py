"""Regenerate the committed small corpus fixture AND its golden manifest. A MANUAL step.

    uv run python pipelines/corpus-builder/tests/build/fixtures/small-corpus/regenerate.py

Run it only when a deliberate change to this ticket's contract, to CRPS-01's schema or to CRPS-02's
manifest is meant to change the recorded values — and read the resulting diff, because that diff IS
the review. A golden fixture that regenerates itself whenever it disagrees with the code proves
nothing; this file exists so the update is an explicit, reviewable act.

WHY THE CORPUS IS COMMITTED AS BYTES rather than rebuilt from SQL at test time: the SHA-256 of a
SQLite file depends on the local library's page layout and vacuum behaviour, so a rebuilt database
would have no stable hash to record, and `artifacts.corpus_sqlite_sha256` — the single most
load-bearing value in the manifest — could not be golden at all.

The bundle is built into a scratch directory and thrown away; only the manifest is recorded. A
committed whole BUNDLE (with `tantivy/` and a signature over wall-clock timestamps) is CRPS-08's
deliverable, not this ticket's.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve()
TESTS_BUILD = HERE.parents[2]
sys.path.insert(0, str(TESTS_BUILD))

import candidate_paths  # noqa: E402,F401  (the sys.path prelude for `src/`)
from candidate_fixtures import (  # noqa: E402
    FixtureLexicalIndexBuilder,
    build_corpus,
    build_embedding_dir,
    fixture_document_pin,
    fixture_runtime,
    write_evaluation_report,
)
from small_corpus_fixture import (  # noqa: E402
    CORPUS_DB,
    EMBEDDING_DIR,
    EVALUATION_REPORT,
    FIXTURE_DIR,
    GOLDEN_MANIFEST,
    RELEASE_ID,
    fixture_request,
)

from build import assemble_bundle  # noqa: E402


def main() -> int:
    if CORPUS_DB.exists():
        CORPUS_DB.unlink()
    if EMBEDDING_DIR.exists():
        shutil.rmtree(EMBEDDING_DIR)
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)

    build_corpus(CORPUS_DB, release_id=RELEASE_ID)
    build_embedding_dir(
        EMBEDDING_DIR,
        corpus_db=CORPUS_DB,
        release_id=RELEASE_ID,
        document_pin=fixture_document_pin(),
        runtime=fixture_runtime(),
    )
    write_evaluation_report(EVALUATION_REPORT, passing=True)

    with tempfile.TemporaryDirectory() as scratch:
        outcome = assemble_bundle(
            fixture_request(Path(scratch) / "out"), index_builder=FixtureLexicalIndexBuilder()
        )
        if outcome.decision != "BUILT" or outcome.bundle_dir is None:
            print("the fixture build was REJECTED; the golden manifest was NOT updated")
            for result in outcome.gate_report.gates:
                for finding in result.findings:
                    print(f"  {finding.severity} {finding.gate}/{finding.code}: {finding.message}")
            return 1
        GOLDEN_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(outcome.bundle_dir / "release-manifest.json", GOLDEN_MANIFEST)

    print(f"regenerated the small corpus fixture and {GOLDEN_MANIFEST.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
