"""Repository locations and the fixture's fixed constants (CRPS-08).

Every other module in this package calls `ensure_src_on_path()` before importing `contracts` or
`manifest`: `pipelines/corpus-builder/src` is the Python module root fixed by CRPS-01, its directory
name contains a hyphen so it is not importable by package path, and the root pytest config puts only
the repository root on `sys.path`.

The repository root is located by walking up for BOTH root manifests, so this works unchanged inside
a `/start-all` git worktree.

NO KEY MATERIAL LIVES UNDER `fixtures/**`. The development signing key is CRPS-02's, referenced by
path and never copied. (`DEV_SIGNING_KEYFILE` rather than the obvious alternative spelling: the
repository-wide secret scan rejects an ALL-CAPS identifier ending in `_KEY`, and
`tests/manifest/test_no_private_keys_committed.py` asserts that over this very directory.)
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

__all__ = [
    "BASE_DATE",
    "BASE_TIMESTAMP",
    "COMMITTED_BUNDLE_DIR",
    "DEV_PUBLIC_KEYFILE",
    "DEV_SIGNER_ID",
    "DEV_SIGNING_KEYFILE",
    "FIXTURES_DIR",
    "ID_TIMESTAMP_MS",
    "INDEX_VERSION_PLACEHOLDER",
    "RELEASE_ID",
    "SEED_DEFAULT",
    "SRC_DIR",
    "ensure_src_on_path",
    "repo_root",
]


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = repo_root()
MODULE_DIR = REPO_ROOT / "pipelines" / "corpus-builder"
SRC_DIR = MODULE_DIR / "src"
FIXTURES_DIR = MODULE_DIR / "fixtures"

#: The committed artifact (deliverable 5). Consumers (RETR-01, CI) read this path and nothing else.
COMMITTED_BUNDLE_DIR = FIXTURES_DIR / "releases" / "corpus-release-fixture-v1"

#: CRPS-02's committed DEVELOPMENT keypair — the only one this repository holds, and the only one
#: this fixture may ever be signed with (PRD §20.2). The private half stays where CRPS-02 put it.
_CRPS02_KEYS = MODULE_DIR / "tests" / "manifest" / "fixtures" / "keys"
DEV_SIGNING_KEYFILE = _CRPS02_KEYS / "dev-corpus-signing-001.private.json"
DEV_PUBLIC_KEYFILE = _CRPS02_KEYS / "dev-corpus-signing-001.public.json"
DEV_SIGNER_ID = "dev-corpus-signing-001"


def ensure_src_on_path() -> None:
    """Put CRPS-01's module root on `sys.path` (idempotent)."""
    entry = str(SRC_DIR)
    if entry not in sys.path:
        sys.path.insert(0, entry)


# ==================================================================================================
# The fixture's fixed constants — deliverable 4 ("no clock, no UUID4, no random")
# ==================================================================================================

#: The default seed. Every id in the fixture is derived from it; changing it changes every id.
SEED_DEFAULT = 20260803

#: The one wall-clock-shaped value the corpus records. A CONSTANT: `created_at`, `retrieved_at`,
#: `captured_at` and `assessed_at` all use it, so the database bytes do not depend on when it ran.
BASE_TIMESTAMP = "2026-08-03T00:00:00Z"
BASE_DATE = "2026-08-03"

#: The millisecond field the minted UUIDv7-shaped ids carry. Derived from `BASE_TIMESTAMP` rather
#: than from the clock, so ids are a pure function of the seed.
ID_TIMESTAMP_MS = int(datetime(2026, 8, 3, tzinfo=UTC).timestamp() * 1000)

#: The release this fixture publishes. Fixed, not minted: it is part of the artifact's identity.
RELEASE_ID = "rel_synthetic_fixture_v1"

#: `versions.index` while `tantivy/` is a placeholder.
#:
#: THE TICKET SAYS `null` HERE AND THAT VALUE CANNOT BE WRITTEN. CRPS-02's frozen contract makes
#: `versions.index` required and typed `{"type": "string", "minLength": 1}`
#: (`schemas/corpus-manifest/v1/release-manifest.schema.json` -> `pins.schema.json#/$defs/
#: version_string`), and `verify_bundle()` reports a schema violation at BLOCKING severity — so a
#: `null` here would make the bundle fail its own verification, contradicting the ticket's first
#: acceptance item. This sentinel satisfies both: it is unmistakably not a version, and the
#: "declared, not disguised" requirement is carried by three independent declarations
#: (`tantivy/INDEX_STATE.json`, this value, and `embedding-manifest.json`'s zero vector count and
#: `stub:` model id). Raised for a ticket amendment — see `fixtures/README.md`.
INDEX_VERSION_PLACEHOLDER = "PLACEHOLDER_NO_INDEX"
