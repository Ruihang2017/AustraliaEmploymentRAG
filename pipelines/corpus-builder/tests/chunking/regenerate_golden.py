"""Regenerate `fixtures/expected_chunks.json` from `fixtures/legislative_tree.json`.

RUNNING THIS IS A DELIBERATE ACT. The golden file pins the chunk boundaries of a release: rewriting
it is how a silent boundary change would slip through, which is exactly what the golden test exists
to prevent. Regenerate it only together with a decided `CHUNKER_VERSION` (or `SEGMENTER_VERSION`)
bump and the writeback that goes with it (see `src/chunking/README.md`).

    uv run python pipelines/corpus-builder/tests/chunking/regenerate_golden.py

Not named `test_*`, so pytest does not collect it — same precedent as `tests/schema/corpus_seed.py`.
Every write is BINARY: Python's text mode would translate `\n` to `\r\n` on Windows and the golden
file is compared byte-for-byte.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


_SRC = str(_repo_root() / "pipelines" / "corpus-builder" / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
TREE_PATH = FIXTURES / "legislative_tree.json"
GOLDEN_PATH = FIXTURES / "expected_chunks.json"

from chunking import (  # noqa: E402
    CHUNKER_VERSION,
    DEFAULT_PROFILE,
    SEGMENTER_VERSION,
    NodeVersionInput,
    chunk_document_version,
    profile_fingerprint,
)


def load_tree(path: Path = TREE_PATH) -> list[NodeVersionInput]:
    """The fixture tree as `NodeVersionInput` values, in document order."""
    document = json.loads(path.read_text(encoding="utf-8"))
    return [
        NodeVersionInput(
            node_version_id=item["node_version_id"],
            document_version_id=item["document_version_id"],
            parent_node_version_id=item["parent_node_version_id"],
            ordinal=item["ordinal"],
            node_kind=item["node_kind"],
            canonical_text=item["canonical_text"],
            heading=item["heading"],
            display_label=item["display_label"],
        )
        for item in document["nodes"]
    ]


def build_golden(nodes: list[NodeVersionInput]) -> dict[str, object]:
    result = chunk_document_version(nodes, DEFAULT_PROFILE)
    return {
        "chunker_version": CHUNKER_VERSION,
        "segmenter_version": SEGMENTER_VERSION,
        "profile_fingerprint": profile_fingerprint(DEFAULT_PROFILE),
        "profile_id": DEFAULT_PROFILE.profile_id,
        "hard_split": result.hard_split,
        "consolidated": result.consolidated,
        "chunks": [draft.to_json() for draft in result],
    }


def render(golden: dict[str, object]) -> bytes:
    return (
        json.dumps(golden, sort_keys=True, ensure_ascii=False, indent=2) + "\n"
    ).encode("utf-8")


def main() -> None:
    payload = render(build_golden(load_tree()))
    with open(GOLDEN_PATH, "wb") as handle:
        handle.write(payload)
    print(f"wrote {GOLDEN_PATH} ({len(payload)} bytes) for chunker {CHUNKER_VERSION}")


if __name__ == "__main__":
    main()
