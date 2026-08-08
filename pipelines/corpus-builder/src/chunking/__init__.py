"""`chunking` — the deterministic, versioned chunker (CRPS-03, requirement `SRCH-003`).

Turns `node_version` values into `SearchChunkDraft` values such that no chunk spans two independent
legal nodes, every chunk's offsets slice the exact stored `canonical_text`, and a re-run with the
same profile over the same input reproduces byte-identical results.

This module performs NO I/O of any kind — no file, no socket, no database, no subprocess — holds no
module-level mutable state and no cache, and reads no clock and no RNG. It writes no `search_chunk`
row (CRPS-06 persists them) and assigns no index tier (CRPS-04 owns that; see README.md).

Import path convention (set by CRPS-01, `contracts/__init__.py`): modules under
`pipelines/corpus-builder/src/` are TOP-LEVEL Python modules rooted at that directory, so this one is
imported as `chunking`.
"""

from __future__ import annotations

from .chunker import (
    ChunkDrafts,
    SearchChunkDraft,
    chunk_document_version,
    chunk_node_version,
)
from .models import NodeVersionInput
from .profile import CHUNKER_VERSION, DEFAULT_PROFILE, ChunkProfile, profile_fingerprint
from .segment import SEGMENTER_VERSION
from .validate import CHUNK_VIOLATION_CODES, ChunkViolation, validate_chunks

__all__ = [
    "CHUNKER_VERSION",
    "CHUNK_VIOLATION_CODES",
    "DEFAULT_PROFILE",
    "SEGMENTER_VERSION",
    "ChunkDrafts",
    "ChunkProfile",
    "ChunkViolation",
    "NodeVersionInput",
    "SearchChunkDraft",
    "chunk_document_version",
    "chunk_node_version",
    "profile_fingerprint",
    "validate_chunks",
]
