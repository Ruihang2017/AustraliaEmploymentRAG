"""The lexical index builder PORT, and the null builder (CRPS-06 deliverable 3).

Q-CRPS-2 — which offline mechanism actually builds `tantivy/` — is resolved by
`docs/adr/0003-offline-lexical-index-builder.md`, not here. This module defines the seam the ADR's
decision plugs into, and ships the one builder that needs no external tool.

WHAT THIS MODULE MAY KNOW ABOUT THE INDEX: its presence, its `index_version` and its file hashes.
The CONTENTS of `tantivy/` are opaque to `04-corpus-contract` (deliverable 3). Importing
`services/search-rs` from here would create a `04 → 11` edge on top of the existing `11 → 04` edge —
a module cycle that makes `dag-scan.mjs` exit 1 (breakdown plan §6.1, risk R6) — so it never happens,
and `tests/build/test_no_environment_inference.py` asserts the absence by source scan.

`NullLexicalIndexBuilder` writes exactly the ticket's object:
`tantivy/INDEX_STATE.json` = `{state: "ABSENT", reason, index_version: null}`. CRPS-08's committed
fixture writes `{state: "PLACEHOLDER", …}`; sub-PRD **D16** says the two forms converge on THIS one
and that CRPS-08 is amended in the same docs PR. The fixture is another ticket's file and is not
edited from here.

A `CANDIDATE` built with a null index is a BLOCKING gate failure
(`INDEX_BUILDER_NULL_ON_CANDIDATE`, gate 8) so a fixture path can never masquerade as a promotable
release. The check keys on `IndexBuildResult.index_version is None` **and** on the builder's declared
`builder_id`, so a future null-equivalent cannot slip through by renaming its class.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

__all__ = [
    "INDEX_STATE_FILENAME",
    "INDEX_VERSION_ABSENT_SENTINEL",
    "IndexBuildFailed",
    "IndexBuildResult",
    "LexicalIndexBuilder",
    "NullLexicalIndexBuilder",
]

INDEX_STATE_FILENAME = "INDEX_STATE.json"

#: `release-manifest.schema.json` types `versions.index` as a NON-EMPTY STRING, so a null
#: `index_version` cannot be written there: a `null` would make the bundle fail its own verification
#: with `MANIFEST_SCHEMA_INVALID`, which reads as corruption rather than as "no index was built".
#: This sentinel is what `versions.index` carries instead (sub-PRD D16).
INDEX_VERSION_ABSENT_SENTINEL = "PLACEHOLDER_NO_INDEX"


class IndexBuildFailed(RuntimeError):
    """A lexical index builder could not produce an index. Converted to a BLOCKING gate finding."""


@dataclass(frozen=True)
class IndexBuildResult:
    """What a builder reports about the index it just wrote.

    `index_version` is `None` when no real index was produced. Everything else is measured from the
    directory, so a builder cannot claim a size it did not write.
    """

    index_version: str | None
    file_count: int
    byte_size: int
    doc_count: int
    builder_id: str = "unknown"

    def to_dict(self) -> dict[str, object]:
        return {
            "index_version": self.index_version,
            "file_count": self.file_count,
            "byte_size": self.byte_size,
            "doc_count": self.doc_count,
            "builder_id": self.builder_id,
        }


@runtime_checkable
class LexicalIndexBuilder(Protocol):
    """Deliverable 3's port. `build()` writes the index into *out_dir* and describes it.

    An implementation that shells out to an external, separately-built search binary (ADR option a)
    takes that command's path as an explicit `BuildRequest`-supplied input, invokes it with
    `shell=False` on a fixed argv and a timeout, never searches `PATH`, and raises
    `IndexBuildFailed` on a non-zero exit.
    """

    #: A stable identity for the mechanism, recorded in the gate report and checked by gate 8.
    builder_id: str

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:  # pragma: no cover
        ...


def _measure(out_dir: Path) -> tuple[int, int]:
    files = [path for path in out_dir.rglob("*") if path.is_file() and not path.is_symlink()]
    return len(files), sum(path.stat().st_size for path in files)


class NullLexicalIndexBuilder:
    """Writes a declared-absent index. For fixtures and development builds only.

    It never pretends: the state file says `ABSENT`, `index_version` is `None`, and gate 8 refuses
    the resulting bundle outright when `release_kind` is `CANDIDATE`.
    """

    builder_id = "null-lexical-index-builder"

    def __init__(self, reason: str = "no offline lexical index builder was supplied (Q-CRPS-2)") -> None:
        self.reason = reason

    def build(self, corpus_db: Path, out_dir: Path) -> IndexBuildResult:
        out_dir.mkdir(parents=True, exist_ok=True)
        document = {"state": "ABSENT", "reason": self.reason, "index_version": None}
        target = out_dir / INDEX_STATE_FILENAME
        target.write_bytes(
            (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode(
                "utf-8"
            )
        )
        file_count, byte_size = _measure(out_dir)
        _ = corpus_db  # deliberately unread: this builder indexes nothing
        return IndexBuildResult(
            index_version=None,
            file_count=file_count,
            byte_size=byte_size,
            doc_count=0,
            builder_id=self.builder_id,
        )
