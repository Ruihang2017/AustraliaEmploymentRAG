"""Import path and synthetic-tree fixtures for the GOLD-01 dataset suite.

NOT NAMED `conftest.py` ON PURPOSE. Several directories in this repository hold a `conftest.py`,
none of them is a package, and under a whole-suite run only one module named `conftest` survives in
`sys.modules`; a test module importing helpers by that name would get whichever was imported last.
The one-line `conftest.py` beside this file re-exports the pytest fixtures from here — the same
construction as `pipelines/corpus-builder/tests/manifest/manifest_fixtures.py` (CRPS-02).

`pipelines/evaluation/src` is not importable by package path (the member directory name contains a
hyphen-free but non-package name and `src` is not a package root on `sys.path`), and the root
pytest config puts only the repository root on `sys.path`, so this file prepends it. The repository
root is located by walking up for BOTH root manifests, which works unchanged inside a `/start-all`
git worktree.
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
_SRC = str(REPO_ROOT / "pipelines" / "evaluation" / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

#: Transcriptions of the PRD tables this suite asserts the frozen data against.
DATA_DIR = Path(__file__).resolve().parent / "data"

#: The CRPS-08-shaped fixture release `GOLD_RESOLVES --release` resolves gold ids against.
FIXTURE_RELEASE = (
    REPO_ROOT / "pipelines" / "corpus-builder" / "fixtures" / "releases" / "corpus-release-fixture-v1"
)
FIXTURE_RELEASE_TRUSTED_KEY = (
    REPO_ROOT
    / "pipelines"
    / "corpus-builder"
    / "tests"
    / "manifest"
    / "fixtures"
    / "keys"
    / "dev-corpus-signing-001.public.json"
)

import pytest  # noqa: E402

from dataset.sealedbox import generate_keypair  # noqa: E402
from fixture_tree import build_fixture_tree  # noqa: E402


@pytest.fixture()
def ephemeral_recipient() -> tuple[bytes, bytes]:
    """A seal key pair generated IN THIS PROCESS and never written to the repository.

    The private half exists for the duration of one test. No file this ticket commits, at any point,
    holds a private key (sub-PRD D2; deliverable 8's assertion).
    """
    return generate_keypair()


@pytest.fixture()
def dataset_tree(tmp_path, ephemeral_recipient):
    """Build a synthetic three-category tree under `tmp_path`.

    Every deviation a negative fixture needs is a keyword argument, so a test varies exactly one
    thing and its failure names exactly one rule.
    """
    public_key, _private_key = ephemeral_recipient

    def factory(**overrides):
        return build_fixture_tree(tmp_path, recipient_public=public_key, **overrides)

    return factory
