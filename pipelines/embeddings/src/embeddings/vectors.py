"""The vector index file, and THE ONLY MODULE IN THIS PACKAGE THAT MAY IMPORT usearch OR numpy.

The on-disk USearch file is the cross-language contract between this pipeline and
`services/search-rs` (PRD §18.2; RETR-05, which is `blocked_by` this ticket). Everything else here
is stdlib-only and talks to this module through the `VectorIndexWriter` port, so every unit of
build logic stays testable with no third-party dependency at all — see `RecordingWriter` in the
test fixtures.

`threads=1` IS A CORRECTNESS REQUIREMENT, NOT A PERFORMANCE CHOICE
------------------------------------------------------------------
USearch's HNSW level generator is a default-constructed `std::default_random_engine` living in the
per-thread insertion context. With ONE context and a fixed insertion order the level sequence is
fixed and `Index.save()` is byte-deterministic; with multi-threaded insertion there is one
generator per thread plus an unordered interleaving, and two identical builds produce different
file bytes. That alone would fail the ticket's determinism criterion for a SIGNED release artifact.

So `threads=1` is passed explicitly at every `add()` call site, and
`tests/test_embed_vector_file.py` asserts the literal by parsing this file — a source assertion
that runs unconditionally, including where `usearch` is not installed, precisely because a future
edit adding threads "for speed" would silently destroy reproducibility.

KEYS
----
USearch keys are `uint64`; `search_chunk.id` is a string. This module assigns keys BY POSITION in
the build's deterministic order (0, 1, 2, …) and never hashes the id into a key — a 64-bit hash of
a UUID-shaped id collides eventually and silently drops a vector, and the count check can still
pass if two collide and one is skipped. The id -> position mapping is persisted through
`chunk_embedding.vector_key`, exactly as the ticket specifies (`vector_key = f"{search_chunk_id}"`),
with ordinal recovery via the same deterministic ordering.

AVAILABILITY
------------
Module import is dependency-free on purpose: `usearch` and `numpy` are imported inside
`UsearchIndexWriter.__init__`, so the rest of the suite loads even when they are absent. They are
declared in this member's `pyproject.toml` and present in the root `uv.lock`, but the root project
is a virtual project with empty `dependencies` and nothing depends on this member, so `uv sync`
installs neither. That plumbing is FND-01/FND-02's file-scope, not this ticket's.
"""

from __future__ import annotations

import array
import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .errors import VectorBackendUnavailable

__all__ = [
    "CONNECTIVITY",
    "EXPANSION_ADD",
    "EXPANSION_SEARCH",
    "USEARCH_METRIC",
    "UsearchIndexWriter",
    "VectorFileStat",
    "VectorIndexWriter",
]

# Explicit index parameters. The library defaults are a version-dependent input to a SIGNED
# artifact's bytes, so they are named here rather than inherited: a USearch upgrade that changed a
# default would otherwise change the file hash with nothing in this repository to point at.
CONNECTIVITY = 16
EXPANSION_ADD = 128
EXPANSION_SEARCH = 64

#: The profile's `distance_metric` vocabulary mapped onto USearch's. The profile's values are the
#: ticket's lowercase Literals; this table is the single place the two vocabularies meet.
USEARCH_METRIC = {"cosine": "cos", "ip": "ip", "l2": "l2sq"}

#: The profile's `quantisation` vocabulary mapped onto USearch's scalar kinds.
_USEARCH_DTYPE = {"none": "f32", "int8": "i8", "binary": "b1"}


@dataclass(frozen=True)
class VectorFileStat:
    """What the manifest's `vector_file` needs about the file that was actually written."""

    sha256: str
    byte_size: int
    count: int


class VectorIndexWriter(Protocol):
    """The port. `build.py` knows only this; `RecordingWriter` in the tests is the other side."""

    def add(self, vector_key: str, vector: "array.array[float]") -> None: ...

    def finalise(self, path: Path) -> VectorFileStat: ...


class UsearchIndexWriter:
    """Writes PRD §18.4's `vectors.usearch`."""

    def __init__(self, dimensions: int, metric: str, quantisation: str) -> None:
        try:
            import numpy  # noqa: F401
            from usearch.index import Index
        except ImportError as exc:  # pragma: no cover - exercised only where the backend is absent
            raise VectorBackendUnavailable(
                "usearch/numpy are not importable, so no vector file can be written. They are "
                "declared in pipelines/embeddings/pyproject.toml and present in the root uv.lock, "
                "but the root project is a virtual project with empty `dependencies` and nothing "
                "depends on this workspace member, so `uv sync --frozen` installs neither. The fix "
                "is in the root pyproject.toml / CI workflow, which are FND-01/FND-02's file-scope "
                f"and not CRPS-05's. Underlying error: {exc}"
            ) from exc

        if metric not in USEARCH_METRIC:
            raise ValueError(f"unsupported distance_metric {metric!r}")
        if quantisation not in _USEARCH_DTYPE:
            raise ValueError(f"unsupported quantisation {quantisation!r}")

        self._numpy = numpy
        self._dimensions = dimensions
        self._count = 0
        self._index = Index(
            ndim=dimensions,
            metric=USEARCH_METRIC[metric],
            dtype=_USEARCH_DTYPE[quantisation],
            connectivity=CONNECTIVITY,
            expansion_add=EXPANSION_ADD,
            expansion_search=EXPANSION_SEARCH,
        )

    def add(self, vector_key: str, vector: "array.array[float]") -> None:
        if len(vector) != self._dimensions:
            raise ValueError(
                f"vector for {vector_key!r} has {len(vector)} components, expected {self._dimensions}"
            )
        payload = self._numpy.frombuffer(vector, dtype=self._numpy.float32)
        # threads=1 — see the module docstring. NOT a performance knob.
        self._index.add(self._count, payload, threads=1)
        self._count += 1

    def finalise(self, path: Path) -> VectorFileStat:
        """Save, hash, then `os.replace` into place.

        The save goes to a sibling temporary path first, so a crash mid-write leaves NOTHING at the
        final path — the ticket's all-or-nothing requirement for steps 4-6, and the reason a
        half-written index can never be mistaken for a complete one.
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_name(path.name + ".partial")
        self._index.save(str(temporary))
        data = temporary.read_bytes()
        os.replace(temporary, path)
        return VectorFileStat(
            sha256=hashlib.sha256(data).hexdigest(),
            byte_size=len(data),
            count=self._count,
        )
