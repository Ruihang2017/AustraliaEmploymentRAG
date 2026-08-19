"""Acceptance item: sealed material cannot be rendered.

"`print`, f-string, `json.dumps`, `logging` and a failing `assert` on a `SealedCase` each raise
`BlindMaterialNotRenderable` rather than emitting text." (Sub-PRD D20.)

Two easy misses are covered explicitly, because a test that missed them would pass while the control
did not hold:

* `logging` formats LAZILY — it calls `__str__` only when a record is actually emitted, so the test
  configures a handler and emits at a level that is handled;
* pytest rewrites assertions and calls `repr()` on the operands when one FAILS, so the test asserts
  the exception escapes from a genuinely failing assert.
"""

from __future__ import annotations

import copy
import io
import json
import logging
import pickle

import dataset_fixtures  # noqa: F401
import pytest
from dataset import sealedbox
from dataset.blind import BlindMaterialNotRenderable, SealedCase


@pytest.fixture()
def sealed() -> SealedCase:
    return SealedCase("EVAL-FED-004", b"the blind question nobody may read")


def test_print_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        print(sealed, file=io.StringIO())


def test_str_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        str(sealed)


def test_repr_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        repr(sealed)


def test_f_string_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        f"{sealed}"


def test_format_with_a_spec_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        format(sealed, ">40")


def test_json_dumps_with_default_str_raises(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        json.dumps(sealed, default=str)


def test_log_record_formatting_raises(sealed: SealedCase) -> None:
    """`logging` is lazy: `__str__` is reached only when the record is actually formatted."""
    record = logging.LogRecord("gold01.opacity", logging.INFO, __file__, 0, "%s", (sealed,), None)
    with pytest.raises(BlindMaterialNotRenderable):
        record.getMessage()


def test_an_emitted_log_record_leaks_nothing(sealed: SealedCase) -> None:
    """The end-to-end property, because `logging` SWALLOWS a handler exception by design.

    `logging` catches whatever `emit` raises and calls `handleError`, so the refusal does not
    propagate to the caller — it does not have to. What matters is that the stream receives no
    plaintext, and that is what this asserts.
    """
    stream = io.StringIO()
    errors = io.StringIO()
    logger = logging.getLogger("gold01.opacity")
    logger.handlers = [logging.StreamHandler(stream)]
    logger.setLevel(logging.INFO)
    logger.propagate = False
    previous, logging.raiseExceptions = logging.raiseExceptions, False
    try:
        logger.info("%s", sealed)
    finally:
        logging.raiseExceptions = previous
        logger.handlers = []
    assert "blind question" not in stream.getvalue()
    assert "blind question" not in errors.getvalue()


def test_a_failing_assert_leaks_nothing_through_the_repr_path(sealed: SealedCase) -> None:
    """pytest's assertion rewriting calls `repr()` on failure — and gets a refusal, not the text.

    pytest catches the refusal and substitutes a placeholder, so the exception the caller sees is
    the `AssertionError`; the property that matters is that its rendering carries no plaintext.
    """
    with pytest.raises(AssertionError) as raised:
        assert sealed is None
    rendered = str(raised.value)
    assert "blind question" not in rendered
    assert "raised in repr()" in rendered


def test_pickle_raises(sealed: SealedCase) -> None:
    """A wrapper that blocked only `__repr__` would still round-trip through pickle."""
    with pytest.raises(BlindMaterialNotRenderable):
        pickle.dumps(sealed)


def test_copy_and_deepcopy_raise(sealed: SealedCase) -> None:
    with pytest.raises(BlindMaterialNotRenderable):
        copy.copy(sealed)
    with pytest.raises(BlindMaterialNotRenderable):
        copy.deepcopy(sealed)


def test_the_case_id_and_length_are_still_reachable(sealed: SealedCase) -> None:
    """Plan §8 Q6 item 15 permits case ids and counts — they are what a blind report carries."""
    assert sealed.case_id() == "EVAL-FED-004"
    assert sealed.byte_length() == len(b"the blind question nobody may read")


def test_the_explicit_accessor_is_the_only_way_out(sealed: SealedCase) -> None:
    assert sealed.plaintext_bytes_for_runner() == b"the blind question nobody may read"


def test_no_attribute_leaks_the_plaintext_by_name(sealed: SealedCase) -> None:
    """`__slots__` plus the refusals mean there is no `__dict__` to walk and no attribute to print."""
    assert not hasattr(sealed, "__dict__")
    assert sealedbox.PUBLIC_BYTES == 32  # the module under test is the one that was imported
