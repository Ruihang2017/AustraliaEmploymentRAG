"""Which chunks are embedded, in what order, and what text each one really is.

THREE THINGS THIS MODULE IS THE ONLY PLACE FOR
-----------------------------------------------
1. **Eligibility.** `tiering.is_eligible_for_dense()` is the single definition (CRPS-04 deliverable
   5); this module never re-spells the eligible tier set. A `search_chunk` whose `index_tier` is
   NULL raises `UntieredChunk` — the column is nullable because CRPS-01 creates it and CRPS-04
   fills it, so NULL means "the tiering pass has not run", not "ineligible". Failing closed is the
   only safe reading: treating NULL as ineligible would silently under-embed a release.

2. **Ordering.** The canonical order is `(node_version_id, chunk_ordinal)`, materialised and sorted
   IN PYTHON. `ORDER BY` in SQL would give the same answer today, but the on-disk vector order of a
   signed artifact must not depend on the database's collation or iteration order — that is exactly
   the coupling the ticket's deliverable 3 step 2 warns about, and a Python sort over an explicit
   key is the version of it a reviewer can check.

3. **Text reconstruction, verified.** `search_chunk` stores OFFSETS, not text: the chunk is
   `node_version.canonical_text[start_offset:end_offset]`, half-open CHARACTER offsets into the
   NFC-normalised text (CRPS-03). The slice is taken on the Python `str` — never with SQL `substr`,
   which is 1-based and whose unit differs by build. Every slice is then hashed and compared with
   `search_chunk.text_hash`; a disagreement raises `ChunkTextMismatch` naming the chunk.

   That check is the ONLY thing standing between an offset or normalisation drift and plausible but
   wrong vectors inside a signed release, so it is unconditional — not a debug flag, and never
   "embed it anyway".

CONSOLIDATED CHUNKS ARE ANCHOR-SPAN ONLY. CRPS-03 deliberately keeps a consolidated chunk's offsets
and `text_hash` on the FIRST participant and carries the group in
`SearchChunkDraft.consolidated_node_version_ids` — a field with NO column in `search_chunk`. Reading
from the corpus database the group cannot be reconstructed, and the hash check above forces the
anchor span in any case. CRPS-03's docstring names CRPS-05 as the consumer that would join the
sibling text; the database as built cannot express it. Raised as a writeback, not solved here.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any, Iterator, Sequence

from ._bootstrap import load_contracts_validate, load_tiering
from .errors import ChunkTextMismatch, IneligibleTierRequested, UntieredChunk

__all__ = [
    "DEFAULT_TIERS",
    "SelectedChunk",
    "iter_chunk_texts",
    "resolve_requested_tiers",
    "select_chunks",
]


@dataclass(frozen=True)
class SelectedChunk:
    """One `search_chunk` row that is eligible for dense indexing, with its ordering key."""

    search_chunk_id: str
    node_version_id: str
    chunk_ordinal: int
    start_offset: int
    end_offset: int
    text_hash: str
    index_tier: str

    @property
    def order_key(self) -> tuple[str, int]:
        return (self.node_version_id, self.chunk_ordinal)


def DEFAULT_TIERS() -> tuple[Any, ...]:  # noqa: N802 - a lazy constant; `tiering` loads on demand
    """Tier 1 only.

    PRD §17.2 makes Tier 2 *selective/on-demand*, and CRPS-04 exports `is_default_dense()` precisely
    to say so. A caller that wants the selective Tier 2 subset asks for it explicitly with
    `--tiers`; defaulting to "everything eligible" would embed the whole long tail.
    """
    tiering = load_tiering()
    return (tiering.IndexTier.TIER_1_FULL_SEMANTIC,)


def resolve_requested_tiers(requested: Sequence[str] | None) -> tuple[Any, ...]:
    """Validate `--tiers` against `is_eligible_for_dense()`, or return the default selection.

    A tier that is not dense-eligible is refused rather than quietly dropped: that is what makes
    Tier 3, `EXCLUDED_LICENSING` and `QUARANTINED_QUALITY` unreachable by explicit request as well
    as by default.
    """
    tiering = load_tiering()
    if requested is None:
        return DEFAULT_TIERS()

    resolved: list[Any] = []
    for name in requested:
        try:
            tier = tiering.IndexTier(name)
        except ValueError as exc:
            raise IneligibleTierRequested(
                f"{name!r} is not a PRD §17.2 index tier; the vocabulary is "
                f"{[member.value for member in tiering.IndexTier]}"
            ) from exc
        if not tiering.is_eligible_for_dense(tier):
            raise IneligibleTierRequested(
                f"tier {tier.value} is not eligible for dense indexing (PRD §17.2, CRPS-04 "
                "deliverable 5); it cannot be embedded by request either"
            )
        if tier not in resolved:
            resolved.append(tier)
    if not resolved:
        raise IneligibleTierRequested("--tiers was given with no tier in it")
    return tuple(resolved)


def select_chunks(connection: sqlite3.Connection, tiers: Sequence[Any]) -> list[SelectedChunk]:
    """Every `search_chunk` in *tiers*, in the canonical `(node_version_id, chunk_ordinal)` order.

    Reads the whole `search_chunk` table's identity columns — not its text, which is not stored —
    so an untiered row anywhere in the corpus is detected rather than filtered away by a `WHERE`
    clause that would make it invisible.
    """
    tiering = load_tiering()
    wanted = {tier.value for tier in tiers}
    for tier in tiers:
        if not tiering.is_eligible_for_dense(tier):
            raise IneligibleTierRequested(
                f"tier {tier.value} is not eligible for dense indexing (PRD §17.2)"
            )

    selected: list[SelectedChunk] = []
    rows = connection.execute(
        "SELECT id, node_version_id, chunk_ordinal, start_offset, end_offset, text_hash, index_tier"
        " FROM search_chunk"
    ).fetchall()
    for row in rows:
        chunk_id, node_version_id, chunk_ordinal, start, end, text_hash, index_tier = row
        if index_tier is None:
            raise UntieredChunk(
                f"search_chunk {chunk_id!r} has index_tier IS NULL: the CRPS-04 tiering pass has "
                "not run for it. Tiering fails closed — an untiered chunk is neither embedded nor "
                "silently skipped (PRD §11.1, §12.2)."
            )
        if index_tier in wanted:
            selected.append(
                SelectedChunk(
                    search_chunk_id=chunk_id,
                    node_version_id=node_version_id,
                    chunk_ordinal=chunk_ordinal,
                    start_offset=start,
                    end_offset=end,
                    text_hash=text_hash,
                    index_tier=index_tier,
                )
            )

    # Sorted in Python on the explicit key. See the module docstring: the canonical order of a
    # signed artifact must not be delegated to the database.
    selected.sort(key=lambda chunk: chunk.order_key)
    return selected


def iter_chunk_texts(
    connection: sqlite3.Connection, chunks: Sequence[SelectedChunk], batch_size: int
) -> Iterator[list[tuple[SelectedChunk, str]]]:
    """Yield `(chunk, text)` in batches of *batch_size*, verifying every slice against its hash.

    Streaming on purpose: materialising every chunk's text is what would make peak memory scale
    with the corpus instead of with the batch (PRD §19.1's explicit memory limits, acceptance item
    12). The id list itself IS materialised — it must be, to sort it — but it is small.
    """
    sha256_hex = load_contracts_validate().sha256_hex
    text_cache: dict[str, str] = {}
    batch: list[tuple[SelectedChunk, str]] = []

    for chunk in chunks:
        canonical_text = text_cache.get(chunk.node_version_id)
        if canonical_text is None:
            row = connection.execute(
                "SELECT canonical_text FROM node_version WHERE id = ?", (chunk.node_version_id,)
            ).fetchone()
            if row is None:
                raise ChunkTextMismatch(
                    f"search_chunk {chunk.search_chunk_id!r} references node_version "
                    f"{chunk.node_version_id!r}, which does not exist"
                )
            canonical_text = row[0]
            # Bounded on purpose: chunks arrive grouped by node_version_id, so one entry is enough
            # and the cache cannot grow with the corpus.
            text_cache = {chunk.node_version_id: canonical_text}

        text = canonical_text[chunk.start_offset : chunk.end_offset]
        actual = sha256_hex(text)
        if actual != chunk.text_hash:
            raise ChunkTextMismatch(
                f"search_chunk {chunk.search_chunk_id!r}: the text at characters "
                f"[{chunk.start_offset}, {chunk.end_offset}) of node_version "
                f"{chunk.node_version_id!r} hashes to {actual}, but the row records "
                f"{chunk.text_hash}. The chunker and this pipeline disagree about offsets or "
                "normalisation; embedding it anyway would put a plausible but wrong vector into a "
                "signed release."
            )

        batch.append((chunk, text))
        if len(batch) >= batch_size:
            yield batch
            batch = []

    if batch:
        yield batch
