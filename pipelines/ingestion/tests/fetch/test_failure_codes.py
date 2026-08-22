"""Deliverable 7 — every fetch failure code is registered with a non-empty operator action.

ADM-001 / PRD §40.8 item 10. Acceptance: "Every failure code in deliverable 7 is registered with a
non-empty operator action."
"""

from __future__ import annotations

import pytest

from taxrag_pipeline_ingestion.adapter.failures import failure_code_registry
from taxrag_pipeline_ingestion.fetch import FETCH_FAILURE_CODES
from taxrag_pipeline_ingestion.fetch.failures import FETCH_AREA, register_fetch_failure_codes

#: Exactly the codes INGF-02 deliverable 7 lists, in the ticket's order.
TICKET_CODES = (
    "FETCH_DENIED_SCHEME",
    "FETCH_DENIED_HOST",
    "FETCH_DENIED_PATH",
    "FETCH_DENIED_IP",
    "FETCH_DENIED_DNS_UNRESOLVED",
    "FETCH_REDIRECT_DENIED",
    "FETCH_REDIRECT_LIMIT",
    "FETCH_TIMEOUT",
    "FETCH_SIZE_LIMIT",
    "FETCH_DECOMPRESSION_LIMIT",
    "FETCH_TYPE_MISMATCH",
    "FETCH_TLS_ERROR",
    "FETCH_HTTP_ERROR",
    "FETCH_TRANSIENT_FAILURE",
)


def test_the_module_constant_is_exactly_the_ticket_set() -> None:
    assert set(FETCH_FAILURE_CODES) == set(TICKET_CODES)


@pytest.mark.parametrize("code", TICKET_CODES)
def test_each_code_is_registered_with_an_operator_action(code: str) -> None:
    entry = failure_code_registry()[code]  # type: ignore[index]
    assert entry.area == FETCH_AREA
    assert entry.operator_action.strip()


def test_the_registry_and_the_module_constant_agree() -> None:
    registry = failure_code_registry()
    for code, action in FETCH_FAILURE_CODES.items():
        assert registry[code].operator_action == action


def test_registration_is_idempotent() -> None:
    """Importing the package twice under different sys.path entries must not raise."""
    register_fetch_failure_codes()
    register_fetch_failure_codes()
    assert set(FETCH_FAILURE_CODES) <= set(failure_code_registry())
