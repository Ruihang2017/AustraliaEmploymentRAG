"""pytest entry point for the CRPS-02 manifest suite.

Everything real lives in `manifest_fixtures.py`, and the test modules import from THAT, not from
here. The reason is mechanical: `conftest.py` is a basename this repository already uses in
`tests/schema/` and `tests/contracts/`, none of these directories is a package, and a whole-suite
run therefore leaves exactly one module named `conftest` in `sys.modules`. A test module that says
`from conftest import ...` gets whichever one happened to be imported last — which silently worked
for a single-directory run and failed under `uv run pytest`. A uniquely named module cannot collide.
"""

from __future__ import annotations

from manifest_fixtures import bundle_factory, trusted_keys  # noqa: F401
