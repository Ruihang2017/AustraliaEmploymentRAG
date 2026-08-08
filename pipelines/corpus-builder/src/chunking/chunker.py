"""The chunker itself (CRPS-03 deliverables 2, 3 and 5).

Both entry points are PURE functions of their arguments: no I/O, no database, no clock, no RNG, no
module-level mutable state, no cache. That is deliberate and load-bearing, not stylistic — PRD §15.3
makes chunks rebuildable, so a rebuild that moves a boundary invalidates every recorded chunk hash
and every embedding. A shared segmenter instance with an internal cache is the classic way to break
this under the parallel build, so there is none, and `tests/chunking/test_chunk_purity.py` asserts
that mechanically.

Nothing here assigns an index tier: that is CRPS-04's (`src/tiering/**`), the two tickets run
concurrently, and coupling them would be a plan change rather than a code change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from contracts.validate import sha256_hex

from .models import NodeVersionInput
from .profile import ChunkProfile
from .segment import hard_cut_points, paragraph_spans, sentence_spans, trim_span

__all__ = [
    "ChunkDrafts",
    "SearchChunkDraft",
    "chunk_document_version",
    "chunk_node_version",
]


@dataclass(frozen=True, slots=True)
class SearchChunkDraft:
    """One draft `search_chunk` row. EXACTLY these eight members — deliverable 3.

    There is no `index_tier` member: CRPS-04 owns tier assignment, and a field-set test asserts the
    absence so the CRPS-03 / CRPS-04 boundary cannot erode.

    `start_offset` / `end_offset` are half-open CHARACTER offsets into the NFC-normalised
    `canonical_text` of `node_version_id` — including for a consolidated chunk, which anchors to its
    first participant (see `chunk_document_version`).
    """

    node_version_id: str
    chunk_ordinal: int
    start_offset: int
    end_offset: int
    text_hash: str
    char_count: int
    consolidated_node_version_ids: tuple[str, ...]
    profile_id: str

    def to_json(self) -> dict[str, Any]:
        """A plain JSON-ready dict, member order preserved; the tuple becomes a list."""
        return {
            "node_version_id": self.node_version_id,
            "chunk_ordinal": self.chunk_ordinal,
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "text_hash": self.text_hash,
            "char_count": self.char_count,
            "consolidated_node_version_ids": list(self.consolidated_node_version_ids),
            "profile_id": self.profile_id,
        }


class ChunkDrafts(list[SearchChunkDraft]):
    """A `list[SearchChunkDraft]` that also carries the build counters.

    Deliverable 2 fixes the return type as `list[SearchChunkDraft]`; rule 5.2 requires a
    `hard_split` counter returned by `chunk_document_version` so the build can report it. A `list`
    subclass satisfies both literally: `isinstance(result, list)` holds and `result == [draft, ...]`
    compares equal, so every caller written against the declared signature works unchanged.

    * `hard_split` — the number of hard cut POINTS introduced (pieces minus one, summed), i.e. the
      number of places where a single sentence longer than `max_chars` had to be cut mid-sentence.
    * `consolidated` — the number of consolidation groups formed under rule 5.3.
    """

    __slots__ = ("consolidated", "hard_split")

    def __init__(
        self,
        drafts: Iterable[SearchChunkDraft] = (),
        *,
        hard_split: int = 0,
        consolidated: int = 0,
    ) -> None:
        super().__init__(drafts)
        self.hard_split = hard_split
        self.consolidated = consolidated


def _content_span(node: NodeVersionInput) -> tuple[int, int]:
    return trim_span(node.canonical_text, 0, len(node.canonical_text))


def _unit_spans(
    text: str, start: int, end: int, profile: ChunkProfile
) -> tuple[list[tuple[int, int]], int]:
    """The rule 5.2 boundary ladder over `[start, end)`: paragraph, then sentence, then hard cut.

    Returns the unit spans in document order and the number of hard cut points introduced. A hard
    cut is reached only for a unit that is still longer than `max_chars` after the finer boundary
    has been tried, which is exactly the permission rule 5.2 grants.
    """
    hard_split = 0
    units: list[tuple[int, int]] = []
    for paragraph in paragraph_spans(text, start, end):
        if paragraph[1] - paragraph[0] <= profile.max_chars:
            units.append(paragraph)
            continue
        if profile.split_strategy == "paragraph":
            candidates = [paragraph]
        else:
            candidates = sentence_spans(text, paragraph[0], paragraph[1])
        for sentence in candidates:
            if sentence[1] - sentence[0] <= profile.max_chars:
                units.append(sentence)
                continue
            cuts = hard_cut_points(text, sentence[0], sentence[1], profile.max_chars)
            hard_split += len(cuts)
            piece_start = sentence[0]
            for cut in cuts:
                units.append((piece_start, cut))
                piece_start = cut
            units.append((piece_start, sentence[1]))
    return units, hard_split


def _pack(units: Sequence[tuple[int, int]], profile: ChunkProfile) -> list[tuple[int, int]]:
    """Greedily pack unit spans into chunk spans.

    Open a chunk at the first unit; keep appending while the chunk would stay within `max_chars` AND
    has not yet reached `target_chars`. Chunk bounds are UNIT bounds, so inter-unit whitespace is
    never included at a chunk boundary and never straddles two chunks — which is what makes the
    coverage rule "the whole text minus boundary whitespace" true by construction.

    `min_chars` is deliberately NOT used here: the ticket uses it in exactly one place, rule 5.3
    condition 5, and consolidation is the ticket's mechanism for short nodes. A short node yields one
    chunk.
    """
    chunks: list[tuple[int, int]] = []
    current: tuple[int, int] | None = None
    for unit in units:
        if current is None:
            current = unit
            continue
        fits = unit[1] - current[0] <= profile.max_chars
        below_target = current[1] - current[0] < profile.target_chars
        if fits and below_target:
            current = (current[0], unit[1])
        else:
            chunks.append(current)
            current = unit
    if current is not None:
        chunks.append(current)
    return chunks


def _drafts_for_span(
    node: NodeVersionInput,
    chunk_spans: Sequence[tuple[int, int]],
    profile: ChunkProfile,
    content_start: int,
    consolidated_ids: tuple[str, ...] = (),
) -> list[SearchChunkDraft]:
    text = node.canonical_text
    drafts: list[SearchChunkDraft] = []
    for ordinal, (start, end) in enumerate(chunk_spans):
        if ordinal and profile.overlap_chars:
            start = max(start - profile.overlap_chars, content_start)
        drafts.append(
            SearchChunkDraft(
                node_version_id=node.node_version_id,
                chunk_ordinal=ordinal,
                start_offset=start,
                end_offset=end,
                text_hash=sha256_hex(text[start:end]),
                char_count=end - start,
                consolidated_node_version_ids=consolidated_ids,
                profile_id=profile.profile_id,
            )
        )
    return drafts


def chunk_node_version(node: NodeVersionInput, profile: ChunkProfile) -> ChunkDrafts:
    """Chunk ONE node version. A chunk never spans two node versions (rule 5.1).

    A node with no content — a pure structural container such as a Part or Division heading with an
    empty or whitespace-only `canonical_text` — produces ZERO chunks, not an empty chunk (rule 5.4).
    """
    text = node.canonical_text
    content_start, content_end = _content_span(node)
    if content_start >= content_end:
        return ChunkDrafts()
    units, hard_split = _unit_spans(text, content_start, content_end, profile)
    chunk_spans = _pack(units, profile)
    return ChunkDrafts(
        _drafts_for_span(node, chunk_spans, profile, content_start),
        hard_split=hard_split,
    )


def _trimmed_length(node: NodeVersionInput) -> int:
    start, end = _content_span(node)
    return end - start


def _consolidation_groups(
    nodes: Sequence[NodeVersionInput], profile: ChunkProfile
) -> list[list[int]]:
    """Group indices of adjacent sibling nodes that may share one chunk (rule 5.3).

    The input order is the caller's document order and is NEVER re-sorted; a caller that supplies
    some other order simply gets no consolidation, which is the safe direction.

    A group extends only when ALL of the ticket's five conditions hold, plus equal `node_kind`.
    That last one is how *"headings never consolidate with operative text"* is implemented:
    `packages/contracts` publishes no `NodeKind` family yet (`document_node.node_kind` is `pending`,
    gap Q-CRPS-4) and CRPS-01 forbids hand-copying enum values, so requiring every participant to
    share one kind needs no vocabulary. It is strictly conservative — it can only refuse a merge a
    vocabulary-aware rule would allow, never permit one it would refuse — and tightens by itself
    once `FND-03` publishes the family.
    """
    lengths = [_trimmed_length(node) for node in nodes]
    eligible = [
        0 < lengths[index] < profile.min_chars for index in range(len(nodes))
    ]
    groups: list[list[int]] = []
    index = 0
    while index < len(nodes):
        if not eligible[index]:
            index += 1
            continue
        group = [index]
        total = lengths[index]
        anchor = nodes[index]
        follower = index + 1
        while follower < len(nodes):
            candidate = nodes[follower]
            previous = nodes[group[-1]]
            if not eligible[follower]:
                break
            if candidate.document_version_id != anchor.document_version_id:
                break
            if candidate.parent_node_version_id != anchor.parent_node_version_id:
                break
            if candidate.ordinal != previous.ordinal + 1:
                break
            if candidate.node_kind != anchor.node_kind:
                break
            if total + lengths[follower] > profile.max_chars:
                break
            group.append(follower)
            total += lengths[follower]
            follower += 1
        if len(group) > 1:
            groups.append(group)
        index = group[-1] + 1
    return groups


def chunk_document_version(
    nodes: Sequence[NodeVersionInput], profile: ChunkProfile
) -> ChunkDrafts:
    """Chunk a whole document version's nodes, consolidating within a provision (rule 5.3).

    Output order is the input node order. Offsets and `text_hash` of a consolidated chunk stay
    anchored to the FIRST participant's own text: deliverable 5.6 defines `text_hash` over
    `text[start:end]`, `char_count` is that same span, and a `search_chunk` row physically holds one
    `node_version_id` and one offset pair — so a hash over several nodes' concatenated text would
    break all three and would create exactly the cross-node offset PRD §15.3 forbids.
    `consolidated_node_version_ids` is what tells CRPS-05 / CRPS-06 which sibling nodes belong to the
    same retrieval unit; joining their text is the consumer's rule, not this module's.

    A non-anchor participant emits NO chunk of its own: `search_chunk` is unique on
    `(node_version_id, chunk_ordinal)`, and a second row would also double-count the group's text.
    """
    if not profile.consolidate_within_provision:
        drafts = ChunkDrafts()
        for node in nodes:
            produced = chunk_node_version(node, profile)
            drafts.extend(produced)
            drafts.hard_split += produced.hard_split
        return drafts

    groups = _consolidation_groups(nodes, profile)
    anchor_of: dict[int, tuple[str, ...]] = {}
    suppressed: set[int] = set()
    for group in groups:
        anchor_of[group[0]] = tuple(nodes[index].node_version_id for index in group)
        suppressed.update(group[1:])

    drafts = ChunkDrafts(consolidated=len(groups))
    for index, node in enumerate(nodes):
        if index in suppressed:
            continue
        produced = chunk_node_version(node, profile)
        drafts.hard_split += produced.hard_split
        consolidated_ids = anchor_of.get(index)
        if consolidated_ids is None:
            drafts.extend(produced)
            continue
        # Every participant is shorter than `min_chars` and `min_chars <= max_chars`, so the anchor
        # packs into exactly one chunk; re-emit it carrying the group.
        for draft in produced:
            drafts.append(
                SearchChunkDraft(
                    node_version_id=draft.node_version_id,
                    chunk_ordinal=draft.chunk_ordinal,
                    start_offset=draft.start_offset,
                    end_offset=draft.end_offset,
                    text_hash=draft.text_hash,
                    char_count=draft.char_count,
                    consolidated_node_version_ids=consolidated_ids,
                    profile_id=draft.profile_id,
                )
            )
    return drafts
