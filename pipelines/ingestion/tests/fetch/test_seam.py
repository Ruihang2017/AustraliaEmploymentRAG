"""Deliverable 6 + 10 — the constants are the PRD §37.4 defaults and the seam is test-only.

Kept apart from `test_limits.py` (which exercises the *runtime* size/time/type/retry limits through
the fetcher) because these assertions are about the value object itself.
"""

from __future__ import annotations

import pytest
from fetch_seam import TestFetchLimits

from taxrag_pipeline_ingestion.fetch import errors as errors_module
from taxrag_pipeline_ingestion.fetch import limits as limits_module
from taxrag_pipeline_ingestion.fetch.limits import FetchLimits, FetchLimitsError


def test_the_defaults_are_exactly_the_prd_37_4_numbers() -> None:
    """R14: the caps are exercised through small overrides, so the real numbers are asserted here."""
    assert limits_module.MAX_REDIRECTS == 5
    assert limits_module.FETCH_TIMEOUT_SECONDS == 30
    assert limits_module.MAX_DOCUMENT_BYTES == 50 * 1024**2
    assert limits_module.MAX_DECOMPRESSED_BYTES == 250 * 1024**2
    assert limits_module.MAX_COMPRESSION_RATIO == 100
    assert limits_module.MAX_ATTEMPTS == 3
    assert limits_module.CONNECT_TIMEOUT_SECONDS == 10
    assert limits_module.READ_TIMEOUT_SECONDS == 30

    default = FetchLimits()
    assert default.max_redirects == limits_module.MAX_REDIRECTS
    assert default.fetch_timeout_seconds == limits_module.FETCH_TIMEOUT_SECONDS
    assert default.max_document_bytes == limits_module.MAX_DOCUMENT_BYTES
    assert default.max_decompressed_bytes == limits_module.MAX_DECOMPRESSED_BYTES
    assert default.max_compression_ratio == limits_module.MAX_COMPRESSION_RATIO
    assert default.max_attempts == limits_module.MAX_ATTEMPTS
    assert default.allow_loopback_for_tests is False


def test_limits_are_frozen() -> None:
    with pytest.raises(Exception):
        FetchLimits().max_document_bytes = 1  # type: ignore[misc]


def test_the_test_package_can_enable_the_loopback_seam() -> None:
    seam = TestFetchLimits(max_document_bytes=1024)
    assert seam.allow_loopback_for_tests is True
    assert seam.max_document_bytes == 1024


def test_a_src_module_cannot_enable_the_loopback_seam() -> None:
    """Deliverable 10(b). The guard reads the CONSTRUCTING frame's `__file__`, so executing the
    same construction with a `__file__` under `src/` must be refused."""
    src_file = str(errors_module.__file__)
    namespace = {"__file__": src_file, "FetchLimits": FetchLimits}
    with pytest.raises(FetchLimitsError):
        exec(  # noqa: S102 — the point of the test is to run it from a foreign frame
            "FetchLimits(allow_loopback_for_tests=True)",
            namespace,
        )


def test_a_frame_with_no_file_cannot_enable_the_loopback_seam() -> None:
    with pytest.raises(FetchLimitsError):
        exec("FetchLimits(allow_loopback_for_tests=True)", {"FetchLimits": FetchLimits})  # noqa: S102


def test_there_is_no_environment_override_path() -> None:
    source = limits_module.__file__
    assert source is not None
    text = open(source, encoding="utf-8").read()
    assert "getenv" not in text
    assert "environ" not in text


@pytest.mark.parametrize(
    "override",
    [
        {"max_document_bytes": 0},
        {"fetch_timeout_seconds": 0},
        {"max_attempts": 0},
        {"max_redirects": -1},
    ],
)
def test_a_nonsense_limit_is_rejected(override: dict[str, int]) -> None:
    with pytest.raises(FetchLimitsError):
        FetchLimits(**override)  # type: ignore[arg-type]
