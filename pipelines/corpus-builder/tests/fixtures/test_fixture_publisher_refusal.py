"""Cross-check: `CRPS-07`'s publisher must refuse a `SYNTHETIC_FIXTURE` bundle (PRD §12.2, `ADM-002`).

`CRPS-07` (`src/publish/**`) has not landed on this branch, so this SKIPS WITH A NAMED MESSAGE
rather than passing silently — the ticket requires exactly that distinction, because a cross-check
that quietly passes when the thing it checks does not exist is worse than no cross-check.
"""

from __future__ import annotations

import importlib.util

import pytest
from fixture_release_helpers import COMMITTED_BUNDLE_DIR

SKIP_REASON = (
    "CRPS-07 (pipelines/corpus-builder/src/publish/**) has not landed; the SYNTHETIC_FIXTURE "
    "refusal path cannot be cross-checked yet"
)


def _publisher_available() -> bool:
    try:
        return importlib.util.find_spec("publish") is not None
    except (ImportError, ValueError):
        return False


def test_the_publisher_refuses_the_synthetic_fixture(trusted_keys: dict[str, bytes]) -> None:
    if not _publisher_available():
        pytest.skip(SKIP_REASON)
    import publish  # type: ignore[import-not-found]  # pragma: no cover — CRPS-07 has not landed

    refuse = getattr(publish, "publish_release", None)
    if refuse is None:  # pragma: no cover — surface the shape change instead of guessing
        pytest.fail(
            "CRPS-07 has landed but exposes no `publish_release`; this cross-check needs updating "
            "against its actual API rather than silently passing"
        )
    with pytest.raises(Exception):  # pragma: no cover — CRPS-07 has not landed
        refuse(COMMITTED_BUNDLE_DIR, public_keys=trusted_keys)


def test_the_bundle_declares_the_marker_the_publisher_would_refuse_on() -> None:
    """Unconditional: whatever CRPS-07 ends up doing, the refusable marker must be present now."""
    import json

    document = json.loads(
        (COMMITTED_BUNDLE_DIR / "release-manifest.json").read_text(encoding="utf-8")
    )
    assert document["release_kind"] == "SYNTHETIC_FIXTURE"
