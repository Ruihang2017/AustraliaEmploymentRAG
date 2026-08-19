"""pytest entry point for the CRPS-06 gate suite.

`tests/build` holds the real fixture module (`candidate_fixtures.py`), because the gate tests and
the build tests must exercise ONE baseline candidate — a second, separately maintained baseline
would let a gate test pass against a corpus the build tests never build. This module puts
`tests/build` on `sys.path` and re-exports the fixtures from there.

Nothing real lives in this file: `conftest` is a basename several test directories in this
repository use, none of them is a package, and a whole-suite run leaves exactly one module named
`conftest` in `sys.modules` (see `tests/manifest/conftest.py`, which paid for that lesson).
"""

from __future__ import annotations

import sys
from pathlib import Path

_BUILD_TESTS = str(Path(__file__).resolve().parent.parent / "build")
if _BUILD_TESTS not in sys.path:
    sys.path.insert(0, _BUILD_TESTS)

from candidate_fixtures import candidate_factory, trusted_keys  # noqa: E402,F401
