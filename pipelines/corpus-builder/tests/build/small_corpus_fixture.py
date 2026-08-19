"""The COMMITTED small corpus fixture: its paths, its build request, and its golden manifest rule.

WHY A COMMITTED FIXTURE AND NOT ANOTHER GENERATED ONE (ticket acceptance, `[fixture]` item).
`test_build_determinism.py` compares two freshly generated candidates against EACH OTHER, which
proves the build is self-consistent and proves nothing about whether it is right: a regression that
changed how every manifest is assembled would keep both sides equal and pass. The acceptance item
therefore asks for an end-to-end build over a committed corpus whose manifest reproduces RECORDED
GOLDEN VALUES — the same discipline `tests/manifest/fixtures/golden/` uses for CRPS-02's manifest and
`tests/chunking`'s golden fixture uses for CRPS-03's chunker. The golden file is a second,
independent statement of the expected result, written down once and reviewed by a human.

WHAT IS COMMITTED, AND WHY EACH FILE HAS TO BE.

* `small-corpus/corpus.sqlite` — the corpus, as BYTES. Regenerating it from SQL at test time would
  make `artifacts.corpus_sqlite_sha256` depend on the local SQLite build's page layout, so the
  golden hash could not be recorded at all. Committing the file makes the hash a fact.
* `small-corpus/embeddings/{vectors.usearch,embedding-manifest.json,embedding-build-report.json}` —
  CRPS-05's outputs as this ticket consumes them, likewise committed as bytes. `usearch` is declared
  but not installed in this workspace (FND-01) and nothing here parses the vector file.
* `small-corpus/evaluation-report.json` — `21-evaluation-600`'s output, as the gate consumes it.
* `small-corpus/golden/release-manifest.json` — the recorded expectation.

WHAT THE COMPARISON EXCLUDES, and why that is not a loophole: `build_started_at`,
`build_finished_at`, `created_at` and `signature` (which covers those timestamps). Every hash, count,
coverage entry, pin, version and file entry is compared. The acceptance item's own words are
"excluding timestamps and paths"; there are no absolute paths in a manifest — `files[].path` is
bundle-relative and therefore compared like everything else.

REGENERATION is `regenerate.py` in the fixture directory, deliberately a separate manual step: a
fixture that regenerates itself when it disagrees with the code is not a golden fixture.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from candidate_paths import DEV_PRIVATE_KEYFILE, DEV_PUBLIC_KEYFILE, DEV_SIGNER_ID  # noqa: F401

from build import BuildRequest

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "small-corpus"
CORPUS_DB = FIXTURE_DIR / "corpus.sqlite"
EMBEDDING_DIR = FIXTURE_DIR / "embeddings"
EVALUATION_REPORT = FIXTURE_DIR / "evaluation-report.json"
GOLDEN_MANIFEST = FIXTURE_DIR / "golden" / "release-manifest.json"

#: Fixed, recorded, and never derived from a clock — the golden manifest names it.
RELEASE_ID = "rel-golden-0001"

#: The manifest members a second build cannot reproduce by construction. `signature` is here because
#: it signs the timestamps above; its PRESENCE is asserted separately.
VOLATILE_MEMBERS = ("build_started_at", "build_finished_at", "created_at", "signature")


def stable_manifest(document: dict[str, Any]) -> dict[str, Any]:
    """*document* with the volatile members and the digest that covers them removed."""
    stripped = {key: value for key, value in document.items() if key not in VOLATILE_MEMBERS}
    # `manifest_sha256` is the digest OF the canonical bytes, which include the timestamps above.
    stripped.pop("manifest_sha256", None)
    return stripped


def golden_manifest() -> dict[str, Any]:
    return json.loads(GOLDEN_MANIFEST.read_text(encoding="utf-8"))


def fixture_request(output_dir: Path, **overrides: Any) -> BuildRequest:
    """The build request the golden manifest was recorded from. `regenerate.py` uses this too, so
    the recorded values can never drift from the ones the test builds with."""
    # Imported lazily: `candidate_fixtures` imports pytest, and `regenerate.py` runs outside pytest
    # only in the sense that it never defines a test — the import itself is fine either way.
    from candidate_fixtures import (
        PROFILE_ID,
        fixture_compatibility,
        fixture_document_pin,
        fixture_query_pin,
        fixture_runtime,
        fixture_versions,
    )
    from chunking import DEFAULT_PROFILE

    fields: dict[str, Any] = {
        "corpus_db_path": CORPUS_DB,
        "embedding_dir": EMBEDDING_DIR,
        "output_dir": output_dir,
        "release_id": RELEASE_ID,
        "versions": fixture_versions(),
        "compatibility": fixture_compatibility(),
        "local_model_pins": (fixture_document_pin(), fixture_query_pin()),
        "runtime_pin": fixture_runtime(),
        "embedding_profile_id": PROFILE_ID,
        "chunk_profile_id": DEFAULT_PROFILE.profile_id,
        "public_key_paths": (DEV_PUBLIC_KEYFILE,),
        "release_kind": "CANDIDATE",
        "evaluation_report_path": EVALUATION_REPORT,
        "signing_key_path": DEV_PRIVATE_KEYFILE,
        "signing_key_id": DEV_SIGNER_ID,
    }
    fields.update(overrides)
    return BuildRequest(**fields)
