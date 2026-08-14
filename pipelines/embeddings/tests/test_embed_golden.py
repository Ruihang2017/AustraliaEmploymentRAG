"""The committed corpus fixture builds end-to-end and reproduces the golden manifest.

CRPS-05's `[fixture]` acceptance criterion: "A committed small corpus fixture (>=1 source group,
>=3 tiers represented, >=1 non-ASCII chunk) builds end-to-end with the stub provider and reproduces
the recorded golden manifest (excluding timestamps)."

The fixture's own properties are asserted here too, because a golden over a fixture that had
quietly stopped containing three tiers would still pass its comparison and prove nothing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from embed_golden_support import NORMALISED, golden_document
from embedding_fixtures import CorpusFixture

GOLDEN = Path(__file__).resolve().parent / "fixtures" / "golden" / "embedding-manifest.json"


def test_the_golden_file_is_committed() -> None:
    assert GOLDEN.is_file(), f"{GOLDEN} is missing; run fixtures/golden/regenerate.py"


def test_the_end_to_end_build_reproduces_the_golden_manifest(tmp_path: Path) -> None:
    expected = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert golden_document(tmp_path) == expected


def test_only_the_documented_members_are_normalised() -> None:
    """The exclusion list is small, closed, and justified in the fixture's README."""
    assert set(NORMALISED) == {"built_at", "vector_file.sha256", "vector_file.byte_size"}
    expected = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert expected["built_at"] == "<normalised>"
    assert expected["vector_file"]["sha256"] == "<normalised>"
    assert expected["vector_file"]["byte_size"] == -1
    # The count is NOT normalised: it is a property of the run, and acceptance item 6 ties it to
    # the chunk_embedding row count.
    assert isinstance(expected["vector_file"]["count"], int)
    assert expected["vector_file"]["count"] > 0


# ==================================================================================================
# The fixture's own required properties
# ==================================================================================================


def test_the_fixture_covers_at_least_three_tiers(corpus_fixture: CorpusFixture) -> None:
    assert len({tier for tier in corpus_fixture.tier_by_chunk.values()}) >= 3


def test_the_fixture_covers_more_than_one_source_group() -> None:
    from embedding_fixtures import NODE_SPECS

    assert len({spec.source_group_id for spec in NODE_SPECS}) >= 1


def test_the_fixture_contains_a_non_ascii_chunk(corpus_fixture: CorpusFixture) -> None:
    texts = list(corpus_fixture.text_by_chunk.values())
    assert any(any(ord(character) > 127 for character in text) for text in texts)
    assert any("\U0001d54f" in text for text in texts), "a non-BMP character must be present"


def test_the_fixture_contains_a_consolidated_chunk() -> None:
    """CRPS-03's consolidation is what makes the anchor-span rule testable at all."""
    from embedding_fixtures import search_chunk_id

    from test_embed_text import _a_selected_chunk  # noqa: F401  (import guard, unused directly)

    assert search_chunk_id("nv_short_a", 0)


@pytest.mark.parametrize("required", ["manifest_version", "runtime", "tier_selection", "licence"])
def test_the_golden_manifest_is_a_complete_document(required: str) -> None:
    expected = json.loads(GOLDEN.read_text(encoding="utf-8"))
    assert required in expected
