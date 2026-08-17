"""`NullLexicalIndexBuilder` writes exactly the ticket's declared-absent state file."""

from __future__ import annotations

import json
from pathlib import Path

from candidate_paths import SRC  # noqa: F401

from build import (
    INDEX_STATE_FILENAME,
    INDEX_VERSION_ABSENT_SENTINEL,
    IndexBuildResult,
    LexicalIndexBuilder,
    NullLexicalIndexBuilder,
)


def test_null_builder_writes_the_ticket_s_index_state(tmp_path: Path) -> None:
    builder = NullLexicalIndexBuilder(reason="unit test")
    result = builder.build(tmp_path / "corpus.sqlite", tmp_path / "tantivy")

    state = json.loads((tmp_path / "tantivy" / INDEX_STATE_FILENAME).read_text(encoding="utf-8"))
    # The ticket fixes this object, and it wins over CRPS-08's committed `PLACEHOLDER` form
    # (sub-PRD D16 converges the two on this one, in a docs PR).
    assert state == {"state": "ABSENT", "reason": "unit test", "index_version": None}
    assert result.index_version is None
    assert result.file_count == 1
    assert result.byte_size > 0
    assert result.doc_count == 0
    assert result.builder_id == "null-lexical-index-builder"


def test_null_builder_satisfies_the_port() -> None:
    assert isinstance(NullLexicalIndexBuilder(), LexicalIndexBuilder)


def test_state_file_is_deterministic(tmp_path: Path) -> None:
    first = tmp_path / "a"
    second = tmp_path / "b"
    NullLexicalIndexBuilder(reason="r").build(tmp_path / "corpus.sqlite", first)
    NullLexicalIndexBuilder(reason="r").build(tmp_path / "corpus.sqlite", second)
    assert (first / INDEX_STATE_FILENAME).read_bytes() == (second / INDEX_STATE_FILENAME).read_bytes()


def test_absent_index_version_sentinel_is_a_non_empty_string() -> None:
    """`release-manifest.schema.json` types `versions.index` as a non-empty string.

    A `null` there would fail the bundle's own verification with `MANIFEST_SCHEMA_INVALID`, which
    reads as corruption rather than as "no index was built".
    """
    assert isinstance(INDEX_VERSION_ABSENT_SENTINEL, str)
    assert INDEX_VERSION_ABSENT_SENTINEL


def test_result_is_serialisable() -> None:
    result = IndexBuildResult(
        index_version="1.0.0", file_count=2, byte_size=10, doc_count=3, builder_id="x"
    )
    assert json.loads(json.dumps(result.to_dict()))["index_version"] == "1.0.0"
