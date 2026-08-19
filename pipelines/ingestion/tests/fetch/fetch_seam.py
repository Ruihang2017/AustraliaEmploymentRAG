"""The deliverable 10 test seam, defined in the TEST tree on purpose.

`FetchLimits(allow_loopback_for_tests=True)` refuses to construct unless the calling frame's file
lives under `pipelines/ingestion/tests/`. Keeping this helper here — rather than in
`src/taxrag_pipeline_ingestion/fetch/` — is what makes deliverable 10(b) ("a test asserts the
production constructor cannot enable it") provable rather than merely asserted:
`test_limits.py::test_a_src_module_cannot_enable_the_loopback_seam` executes the same construction
from a module under `src/` and expects `FetchLimitsError`.

The module name is prefixed (`fetch_*`) rather than placed in `conftest.py` so nothing depends on
cross-directory `conftest` imports; INGF-01's `tests/adapter/` suite does `from conftest import …`
of its own.
"""

from __future__ import annotations

from taxrag_pipeline_ingestion.fetch.limits import FetchLimits

__all__ = ["TestFetchLimits"]


def TestFetchLimits(**overrides: object) -> FetchLimits:  # noqa: N802 — a factory, named as the ticket names it
    """`FetchLimits` with the loopback seam enabled plus any *overrides*.

    Not collected by pytest: pytest's `python_functions = test*` glob is case-sensitive, and this
    module's name does not match `python_files` either.
    """
    return FetchLimits(allow_loopback_for_tests=True, **overrides)  # type: ignore[arg-type]
