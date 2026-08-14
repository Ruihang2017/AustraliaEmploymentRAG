"""pytest entry point for the CRPS-08 fixture suite.

Everything real lives in `fixture_release_helpers.py`, and the test modules import from THAT rather
than from here. The reason is mechanical and has already broken this repository once: several test
directories hold a `conftest.py`, none of them is a package, and a whole-suite run leaves exactly one
module named `conftest` in `sys.modules` — so `from conftest import ...` returns whichever was
imported last. A uniquely named helper module cannot collide.
"""

from __future__ import annotations

from fixture_release_helpers import (  # noqa: F401
    corpus_connection,
    regenerated_bundle,
    trusted_keys,
)
