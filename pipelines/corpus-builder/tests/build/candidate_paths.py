"""`sys.path` prelude for the CRPS-06 suites, and the paths they share.

NOT named `conftest.py` ON PURPOSE, and the reason is mechanical rather than stylistic (the same one
`tests/manifest/manifest_fixtures.py` records): several test directories in this repository hold a
`conftest.py`, none of them is a package, and a whole-suite run therefore leaves exactly one module
named `conftest` in `sys.modules`. A test module that says `from conftest import …` gets whichever
one was imported last — which works for a single-directory run and fails under `uv run pytest`.

`pipelines/corpus-builder/src` is not importable by package path (the directory name contains a
hyphen) and the root pytest config puts only the repository root on `sys.path`, so each test
directory in this ticket's file-scope prepends it here. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.
"""

from __future__ import annotations

import sys
from pathlib import Path


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


REPO_ROOT = _repo_root()
CORPUS_BUILDER = REPO_ROOT / "pipelines" / "corpus-builder"
SRC = CORPUS_BUILDER / "src"

if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

#: The COMMITTED development keypair (CRPS-02's fixtures). Referenced BY PATH, never copied —
#: `fixtures/keys/README.md` states that rule, and duplicating a key file would create a second
#: place to rotate.
KEYS = CORPUS_BUILDER / "tests" / "manifest" / "fixtures" / "keys"
DEV_PRIVATE_KEYFILE = KEYS / "dev-corpus-signing-001.private.json"
DEV_PUBLIC_KEYFILE = KEYS / "dev-corpus-signing-001.public.json"
DEV_SIGNER_ID = "dev-corpus-signing-001"

#: The two source trees this ticket owns, for the source-scan tests.
BUILD_SRC = SRC / "build"
VALIDATION_SRC = SRC / "validation"
