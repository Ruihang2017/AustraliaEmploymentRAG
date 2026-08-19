"""pytest entry point for the CRPS-06 build suite.

Everything real lives in `candidate_fixtures.py`, and the test modules import from THAT, not from
here — `conftest` is a basename several test directories in this repository already use, none of
them is a package, and a whole-suite run leaves exactly one module named `conftest` in `sys.modules`
(the collision `tests/manifest/conftest.py` records having paid for).
"""

from __future__ import annotations

from candidate_fixtures import candidate_factory, trusted_keys  # noqa: F401
