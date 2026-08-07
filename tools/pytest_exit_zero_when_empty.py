"""Make `uv run pytest` exit 0 on a tree that legitimately has no tests yet.

FND-01 creates the empty PRD section 20.1 member skeleton; no Python member owns a test
until modules 04, 05, 06-10, 20 and 21 land. pytest reports EXIT_NO_TESTS_COLLECTED (5)
for that state, but PRD section 45.3 requires `uv run pytest` to be a real entry command
that exits 0. This plugin rewrites *only* that one exit code. A collection error, a
failure or an interrupted run keeps its own non-zero status.
"""

from __future__ import annotations

import pytest


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    if exitstatus == pytest.ExitCode.NO_TESTS_COLLECTED:
        session.exitstatus = pytest.ExitCode.OK
