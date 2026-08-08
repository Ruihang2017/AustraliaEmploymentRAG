"""Import path and node factories for the chunker suite (CRPS-03).

`pipelines/corpus-builder/src` is not importable by package path (the member directory name contains
a hyphen) and the root pytest config puts only the repository root on `sys.path`, so each test
directory in this ticket's file-scope prepends it here. The repository root is located by walking up
for BOTH root manifests, which works unchanged inside a `/start-all` git worktree.

The factories build a real CRPS-01 `node_version` INR payload first and go through
`NodeVersionInput.from_inr()`, so the whole suite exercises the record contract rather than a
re-declared local copy of it.
"""

from __future__ import annotations

import sys
import unicodedata
from pathlib import Path

import pytest


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


SRC = _repo_root() / "pipelines" / "corpus-builder" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

FIXTURES = Path(__file__).resolve().parent / "fixtures"

from chunking import NodeVersionInput  # noqa: E402
from contracts.records import NodeVersion  # noqa: E402
from contracts.validate import sha256_hex  # noqa: E402

DOCUMENT_VERSION_ID = "dv_00000000-0000-7000-8000-000000000001"
STABLE_SOURCE_KEY = "au-cth-synthetic-practice-act"
VERSION_LABEL = "2026-01-01"
EFFECTIVE_FROM = "2026-01-01"


def inr_node(
    *,
    stable_node_key: str,
    canonical_text: str,
    ordinal: int,
    heading: str | None = None,
    display_label: str | None = None,
    parent_stable_node_key: str | None = None,
) -> NodeVersion:
    """A CRPS-01 `node_version` INR payload with NFC text and a matching `text_hash`."""
    text = unicodedata.normalize("NFC", canonical_text)
    return NodeVersion(
        stable_source_key=STABLE_SOURCE_KEY,
        version_label=VERSION_LABEL,
        stable_node_key=stable_node_key,
        canonical_text=text,
        ordinal=ordinal,
        effective_from=EFFECTIVE_FROM,
        text_hash=sha256_hex(text),
        parent_stable_node_key=parent_stable_node_key,
        display_label=display_label,
        heading=heading,
    )


def node(
    *,
    node_version_id: str,
    canonical_text: str,
    ordinal: int = 0,
    node_kind: str = "subsection",
    parent_node_version_id: str | None = None,
    document_version_id: str = DOCUMENT_VERSION_ID,
    heading: str | None = None,
    display_label: str | None = None,
) -> NodeVersionInput:
    """One `NodeVersionInput`, built through the INR record and `from_inr()`."""
    record = inr_node(
        stable_node_key=node_version_id,
        canonical_text=canonical_text,
        ordinal=ordinal,
        heading=heading,
        display_label=display_label,
        parent_stable_node_key=parent_node_version_id,
    )
    return NodeVersionInput.from_inr(
        record,
        node_version_id=node_version_id,
        document_version_id=document_version_id,
        parent_node_version_id=parent_node_version_id,
        node_kind=node_kind,
    )


def node_tree(texts: list[str], *, node_kind: str = "subsection") -> list[NodeVersionInput]:
    """A Part → Division → section → subsection tree whose leaves carry *texts*.

    The three ancestors are structural containers with empty `canonical_text`, so they exercise rule
    5.4 in every test that uses this factory.
    """
    part = node(node_version_id="nv_part", canonical_text="", ordinal=0, node_kind="part")
    division = node(
        node_version_id="nv_division",
        canonical_text="",
        ordinal=0,
        node_kind="division",
        parent_node_version_id="nv_part",
    )
    section = node(
        node_version_id="nv_section",
        canonical_text="",
        ordinal=0,
        node_kind="section",
        parent_node_version_id="nv_division",
    )
    leaves = [
        node(
            node_version_id=f"nv_leaf_{index}",
            canonical_text=text,
            ordinal=index,
            node_kind=node_kind,
            parent_node_version_id="nv_section",
        )
        for index, text in enumerate(texts)
    ]
    return [part, division, section, *leaves]


def siblings_of(nodes: list[NodeVersionInput]) -> dict[str, NodeVersionInput]:
    """The `siblings` mapping `validate_chunks()` accepts."""
    return {item.node_version_id: item for item in nodes}


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
