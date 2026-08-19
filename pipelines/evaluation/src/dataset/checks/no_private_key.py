"""`NO_PRIVATE_KEY` — no private sealing material anywhere in this module's trees (sub-PRD D2).

The private half of the blind-dataset pair lives in the Founder's password manager or equivalent
offline encrypted storage, and never in git, CI, ordinary environment configuration or any agent
environment (breakdown plan §8 Q6 item 12). This check is the mechanical half of that statement:
whatever anyone intends, a committed private key fails the build.

Three shapes are refused:
  * a PEM private-key header — the shape the repository secret scanner also matches;
  * a JSON member that carries private scalar material by name;
  * a `blind-recipient.pub` that has been given a private member.

The header literal is ASSEMBLED FROM PARTS. `.github/workflows/checks/secret-scan.mjs` scans every
git-tracked file for it and is a required check, so a source file that spelled it out contiguously
would fail CI on this very branch. Same trick, same reason, as
`pipelines/corpus-builder/tests/manifest/test_no_private_keys_committed.py` and the repository's own
`tools/tests/secret-scan.test.mjs`.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

from ..findings import Finding
from ..model import Dataset
from ..paths import EVALS_DIR, PACKAGE_ROOT
from . import CheckContext

_ID = "NO_PRIVATE_KEY"

_HEADER = re.compile("-{5}" + "BEGIN" + r"[A-Z ]*" + "PRIVATE" + " " + "KEY" + "-{5}")
_MEMBER = re.compile(
    '"(?:' + "private" + "_scalar_base64|" + "private" + "_key_b64|" + "seed" + "_b64|" + "secret" + '_key_b64)"'
)
_SKIP_DIRS = frozenset({"__pycache__", ".pytest_cache", "node_modules", ".venv", "target", ".git"})
_MAX_BYTES = 4 * 1024 * 1024


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    del context
    roots = [dataset.root, EVALS_DIR, PACKAGE_ROOT]
    seen: set[Path] = set()
    files: list[Path] = []
    for root in roots:
        if not Path(root).is_dir():
            continue
        for path in sorted(Path(root).rglob("*")):
            if path in seen or not path.is_file() or path.is_symlink():
                continue
            if any(part in _SKIP_DIRS for part in path.parts):
                continue
            seen.add(path)
            files.append(path)
    return guard_private_material(files)


def guard_private_material(files: Iterable[Path]) -> list[Finding]:
    """The key-less scan, shared with `blind.guard()` so `guard-blind` runs exactly this rule."""
    findings: list[Finding] = []
    for path in files:
        try:
            if path.stat().st_size > _MAX_BYTES:
                continue
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if _HEADER.search(text):
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    "<repository>",
                    None,
                    "the file carries a private-key header; the seal key is never in this "
                    "repository, in CI or in an agent environment (sub-PRD D2, D22)",
                    str(path),
                )
            )
        if _MEMBER.search(text) and path.suffix in (".json", ".pub", ".yaml", ".yml"):
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    "<repository>",
                    None,
                    "the file carries a JSON member that names private key material",
                    str(path),
                )
            )
    return findings
