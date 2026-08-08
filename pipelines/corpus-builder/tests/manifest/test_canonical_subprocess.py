"""Acceptance item 3, second half — the digest is stable across SEPARATE PROCESSES.

Two runs with different `PYTHONHASHSEED` values. Python's dict iteration order is insertion order,
not hash order, so this is belt-and-braces rather than a live hazard — but the manifest is signed,
a Rust verifier must reproduce the bytes, and "we believe dicts are ordered" is not the kind of
claim a signature should rest on.

`sys.executable` rather than `uv run`, so the test works inside a `/start-all` worktree where the
project environment may not be the one running pytest.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from manifest_fixtures import REPO_ROOT, read_manifest

_PROGRAM = """
import json, sys
sys.path.insert(0, sys.argv[1])
from manifest.canonical import canonical_bytes, manifest_sha256
document = json.loads(open(sys.argv[2], encoding="utf-8").read())
sys.stdout.write(manifest_sha256(document) + " " + str(len(canonical_bytes(document))))
"""


def _run(seed: str, source: Path, manifest_path: Path) -> str:
    environment = dict(os.environ)
    environment["PYTHONHASHSEED"] = seed
    result = subprocess.run(
        [sys.executable, "-c", _PROGRAM, str(source), str(manifest_path)],
        capture_output=True,
        text=True,
        env=environment,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_the_digest_is_identical_across_two_processes(bundle_factory, tmp_path: Path) -> None:
    bundle = bundle_factory()
    document = read_manifest(bundle)
    source = REPO_ROOT / "pipelines" / "corpus-builder" / "src"

    forwards = tmp_path / "forwards.json"
    forwards.write_text(json.dumps(document), encoding="utf-8")
    backwards = tmp_path / "backwards.json"
    backwards.write_text(json.dumps(dict(reversed(list(document.items())))), encoding="utf-8")

    first = _run("0", source, forwards)
    second = _run("1", source, backwards)
    assert first == second
    assert first.split()[0] == document["manifest_sha256"]
