"""Two separate processes, two different hash seeds, identical bytes (acceptance item 4).

Rule 6: a rebuild that moves a boundary invalidates every recorded chunk hash and every embedding
(PRD §15.3). The seeds are deliberately DIFFERENT, so this disproves dict- and set-iteration-order
dependence rather than merely re-running the same conditions.

`sys.executable` rather than `uv run python`: the same interpreter, with no dependence on `uv` being
on `PATH` inside a `/start-all` worktree.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from conftest import SRC
from regenerate_golden import GOLDEN_PATH

TESTS_DIR = Path(__file__).resolve().parent

SCRIPT = """
import sys
from regenerate_golden import build_golden, load_tree, render
sys.stdout.buffer.write(render(build_golden(load_tree())))
"""


def run_with_hash_seed(seed: str) -> bytes:
    environment = dict(os.environ)
    environment["PYTHONHASHSEED"] = seed
    environment["PYTHONPATH"] = os.pathsep.join([str(SRC), str(TESTS_DIR)])
    completed = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        capture_output=True,
        check=True,
        env=environment,
        cwd=str(TESTS_DIR),
    )
    assert completed.stdout, completed.stderr.decode("utf-8", "replace")
    return completed.stdout


def test_two_processes_under_different_hash_seeds_agree_byte_for_byte() -> None:
    first = run_with_hash_seed("0")
    second = run_with_hash_seed("12345")
    assert first == second
    with open(GOLDEN_PATH, "rb") as handle:
        assert first == handle.read()
