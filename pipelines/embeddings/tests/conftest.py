"""Import-path prelude and fixture re-export for the embeddings suite (CRPS-05).

DELIBERATELY THIN. Every fixture lives in `embedding_fixtures.py`, a globally unique module name,
and is only re-exported here.

Why: the root pytest config sets `testpaths = ["pipelines", "sdk"]` and no test directory is a
package, so pytest imports test modules by BARE BASENAME. `conftest.py` already exists five times
under `pipelines/`; a `from conftest import ...` in any of them gets whichever was imported last.
CRPS-02 documented that bug and this is its remedy, copied verbatim.

`pipelines/embeddings/src` and `pipelines/corpus-builder/src` are not importable by package path
(both member directory names contain a hyphen) and the root config puts only the repository root on
`sys.path`, so this file prepends both. The repository root is located by walking up for BOTH root
manifests, which works unchanged inside a `/start-all` git worktree.
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
for _path in (
    REPO_ROOT / "pipelines" / "embeddings" / "src",
    REPO_ROOT / "pipelines" / "corpus-builder" / "src",
):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from embedding_fixtures import (  # noqa: E402,F401
    block_all_network,
    corpus_fixture,
    licence_pin,
    model_artefacts,
    out_dir,
    pinned_profile,
    runtime_pin_fixture,
    stub_profile,
)
