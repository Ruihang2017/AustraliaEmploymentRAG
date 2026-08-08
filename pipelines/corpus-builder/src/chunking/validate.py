"""`validate_chunks()` — re-check the boundary rules over produced chunks (CRPS-03 deliverable 7).

Mirrors `contracts.violations` deliberately: the code set is a contract in its own right, a
`ChunkViolation` rejects an undeclared code at construction, and `validate_chunks` NEVER raises. It
is an input to the CRPS-06 completeness gate, and a gate that throws on bad data is useless to a
build whose job is to find bad data.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Mapping, Sequence

from contracts.validate import sha256_hex

from .chunker import SearchChunkDraft
from .models import NodeVersionInput
from .profile import ChunkProfile

__all__ = ["CHUNK_VIOLATION_CODES", "ChunkViolation", "validate_chunks"]

CHUNK_VIOLATION_CODES: Final[frozenset[str]] = frozenset(
    {
        # Rule 5.1 — the load-bearing invariant (PRD §15.3, §35.3).
        "CHUNK_CROSSES_NODES",
        # Rule 5.5 — offsets index the node's own NFC-normalised canonical_text.
        "CHUNK_OFFSET_OUT_OF_RANGE",
        "CHUNK_OVERLAP",
        "CHUNK_GAP",
        "CHUNK_EMPTY",
        "CHUNK_ORDINAL_NONCONTIGUOUS",
        # Rule 5.6 — the chunk's own text hash.
        "CHUNK_HASH_MISMATCH",
        # Rule 5.2 — a unit longer than max_chars must have been split.
        "CHUNK_EXCEEDS_MAX",
        # Rule 5.3 — consolidation is permitted only inside one provision.
        "CHUNK_ILLEGAL_CONSOLIDATION",
    }
)


@dataclass(frozen=True, slots=True)
class ChunkViolation:
    """One finding about one chunk set. Never raised — always returned."""

    code: str
    message: str
    chunk_ordinal: int = -1

    def __post_init__(self) -> None:
        if self.code not in CHUNK_VIOLATION_CODES:
            raise ValueError(
                f"{self.code!r} is not a declared chunk violation code; add it to "
                "CHUNK_VIOLATION_CODES (and to the CRPS-03 ticket) before using it"
            )


def validate_chunks(
    node: NodeVersionInput,
    chunks: Sequence[SearchChunkDraft],
    profile: ChunkProfile,
    *,
    siblings: Mapping[str, NodeVersionInput] | None = None,
) -> list[ChunkViolation]:
    """Return every rule violation in *chunks* as chunks OF *node*. Empty means conforming.

    *siblings* maps `node_version_id` to node for the other nodes of the same document version. It
    is optional so that a call written against the ticket's three-argument signature works; when it
    is absent, a consolidation group is checked only as far as one node allows (the anchor is first
    and present, the ids are unique and non-empty) and the rest of rule 5.3 is NOT asserted. Absence
    of a finding then means "not checked", not "valid".
    """
    text = node.canonical_text
    findings: list[ChunkViolation] = []

    for position, chunk in enumerate(chunks):
        ordinal = chunk.chunk_ordinal
        if chunk.node_version_id != node.node_version_id:
            findings.append(
                ChunkViolation(
                    code="CHUNK_CROSSES_NODES",
                    message=(
                        f"chunk carries node_version_id {chunk.node_version_id!r} but is being "
                        f"validated against {node.node_version_id!r}; a chunk never spans two node "
                        "versions (PRD §15.3)"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
            continue
        if chunk.end_offset <= chunk.start_offset:
            findings.append(
                ChunkViolation(
                    code="CHUNK_EMPTY",
                    message=(
                        f"chunk range [{chunk.start_offset}, {chunk.end_offset}) is empty or "
                        "inverted; a node with no content produces zero chunks, not an empty one"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
            continue
        if chunk.start_offset < 0 or chunk.end_offset > len(text):
            findings.append(
                ChunkViolation(
                    code="CHUNK_OFFSET_OUT_OF_RANGE",
                    message=(
                        f"chunk range [{chunk.start_offset}, {chunk.end_offset}) does not fit the "
                        f"{len(text)}-CHARACTER canonical_text; offsets are character offsets, not "
                        "byte offsets (CRPS-01 deliverable 12)"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
            continue
        span = text[chunk.start_offset : chunk.end_offset]
        if chunk.char_count != chunk.end_offset - chunk.start_offset:
            findings.append(
                ChunkViolation(
                    code="CHUNK_HASH_MISMATCH",
                    message=(
                        f"char_count is {chunk.char_count} but the range "
                        f"[{chunk.start_offset}, {chunk.end_offset}) is "
                        f"{chunk.end_offset - chunk.start_offset} characters long"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
        elif chunk.text_hash != sha256_hex(span):
            findings.append(
                ChunkViolation(
                    code="CHUNK_HASH_MISMATCH",
                    message=(
                        f"text_hash is {chunk.text_hash!r} but the SHA-256 of the UTF-8 bytes of "
                        f"text[{chunk.start_offset}:{chunk.end_offset}] is {sha256_hex(span)!r}"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
        if chunk.end_offset - chunk.start_offset > profile.max_chars:
            findings.append(
                ChunkViolation(
                    code="CHUNK_EXCEEDS_MAX",
                    message=(
                        f"chunk is {chunk.end_offset - chunk.start_offset} characters, over the "
                        f"profile maximum of {profile.max_chars}"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
        if ordinal != position:
            findings.append(
                ChunkViolation(
                    code="CHUNK_ORDINAL_NONCONTIGUOUS",
                    message=(
                        f"chunk at position {position} carries chunk_ordinal {ordinal}; ordinals "
                        "are 0-based, contiguous and ascending within one node version"
                    ),
                    chunk_ordinal=ordinal,
                )
            )
        findings.extend(_check_consolidation(node, chunk, profile, siblings))

    findings.extend(_check_coverage(node, chunks, profile))
    return findings


def _check_consolidation(
    node: NodeVersionInput,
    chunk: SearchChunkDraft,
    profile: ChunkProfile,
    siblings: Mapping[str, NodeVersionInput] | None,
) -> list[ChunkViolation]:
    ids = chunk.consolidated_node_version_ids
    if not ids:
        return []

    def bad(message: str) -> list[ChunkViolation]:
        return [
            ChunkViolation(
                code="CHUNK_ILLEGAL_CONSOLIDATION",
                message=message,
                chunk_ordinal=chunk.chunk_ordinal,
            )
        ]

    if len(ids) < 2:
        return bad(
            f"consolidated_node_version_ids {list(ids)} names fewer than two participants; a "
            "consolidation of one node is not a consolidation — leave the tuple empty"
        )
    if ids[0] != node.node_version_id:
        return bad(
            f"consolidated_node_version_ids starts with {ids[0]!r}; a consolidated chunk anchors "
            f"node_version_id and offsets to its FIRST participant, here {node.node_version_id!r}"
        )
    if len(set(ids)) != len(ids):
        return bad(f"consolidated_node_version_ids {list(ids)} repeats a node version")
    if not all(ids):
        return bad("consolidated_node_version_ids holds an empty node version id")
    if not profile.consolidate_within_provision:
        return bad(
            "the profile sets consolidate_within_provision=False, so no chunk may carry "
            "consolidated_node_version_ids"
        )
    if siblings is None:
        return []

    participants: list[NodeVersionInput] = []
    for identity in ids:
        participant = siblings.get(identity)
        if participant is None:
            return bad(
                f"consolidation participant {identity!r} was not supplied in `siblings`, so rule "
                "5.3 cannot be checked for it"
            )
        participants.append(participant)

    total = 0
    for offset, participant in enumerate(participants):
        stripped = participant.canonical_text.strip()
        total += len(stripped)
        if not stripped:
            return bad(
                f"consolidation participant {participant.node_version_id!r} has no content; a node "
                "with empty canonical_text produces zero chunks and cannot join a group"
            )
        if len(stripped) >= profile.min_chars:
            return bad(
                f"consolidation participant {participant.node_version_id!r} is {len(stripped)} "
                f"characters, not shorter than min_chars={profile.min_chars} (rule 5.3 condition 5)"
            )
        if participant.document_version_id != node.document_version_id:
            return bad(
                f"consolidation participant {participant.node_version_id!r} belongs to document "
                f"version {participant.document_version_id!r}, not {node.document_version_id!r} "
                "(rule 5.3 condition 1)"
            )
        if participant.parent_node_version_id != node.parent_node_version_id:
            return bad(
                f"consolidation participant {participant.node_version_id!r} has parent "
                f"{participant.parent_node_version_id!r}, not {node.parent_node_version_id!r}; only "
                "siblings consolidate (rule 5.3 condition 2)"
            )
        if participant.node_kind != node.node_kind:
            return bad(
                f"consolidation participant {participant.node_version_id!r} is a "
                f"{participant.node_kind!r} but the anchor is a {node.node_kind!r}; headings never "
                "consolidate with operative text (rule 5.3)"
            )
        if participant.ordinal != node.ordinal + offset:
            return bad(
                f"consolidation participant {participant.node_version_id!r} has ordinal "
                f"{participant.ordinal}, breaking the contiguous run from {node.ordinal} "
                "(rule 5.3 condition 3)"
            )
    if total > profile.max_chars:
        return bad(
            f"the consolidation group is {total} characters, over max_chars={profile.max_chars} "
            "(rule 5.3 condition 4)"
        )
    return []


def _check_coverage(
    node: NodeVersionInput, chunks: Sequence[SearchChunkDraft], profile: ChunkProfile
) -> list[ChunkViolation]:
    """Rule 5.5 coverage: non-overlapping, and the only permitted gap is whitespace."""
    text = node.canonical_text
    own = [
        chunk
        for chunk in chunks
        if chunk.node_version_id == node.node_version_id
        and 0 <= chunk.start_offset < chunk.end_offset <= len(text)
    ]
    if not own:
        return []
    findings: list[ChunkViolation] = []
    ordered = sorted(own, key=lambda chunk: (chunk.start_offset, chunk.end_offset))
    if text[: ordered[0].start_offset].strip():
        findings.append(
            ChunkViolation(
                code="CHUNK_GAP",
                message=(
                    f"non-whitespace text before the first chunk at offset "
                    f"{ordered[0].start_offset} is covered by no chunk"
                ),
                chunk_ordinal=ordered[0].chunk_ordinal,
            )
        )
    for left, right in zip(ordered, ordered[1:]):
        if left.end_offset > right.start_offset:
            if profile.overlap_chars == 0:
                findings.append(
                    ChunkViolation(
                        code="CHUNK_OVERLAP",
                        message=(
                            f"chunk ending at {left.end_offset} overlaps the chunk starting at "
                            f"{right.start_offset}; with overlap_chars=0 the chunks of one node are "
                            "non-overlapping"
                        ),
                        chunk_ordinal=right.chunk_ordinal,
                    )
                )
            continue
        if text[left.end_offset : right.start_offset].strip():
            findings.append(
                ChunkViolation(
                    code="CHUNK_GAP",
                    message=(
                        f"non-whitespace text in [{left.end_offset}, {right.start_offset}) is "
                        "covered by no chunk; the only permitted gap between chunks of one node is "
                        "boundary whitespace"
                    ),
                    chunk_ordinal=right.chunk_ordinal,
                )
            )
    if text[ordered[-1].end_offset :].strip():
        findings.append(
            ChunkViolation(
                code="CHUNK_GAP",
                message=(
                    f"non-whitespace text after the last chunk ends at "
                    f"{ordered[-1].end_offset} is covered by no chunk"
                ),
                chunk_ordinal=ordered[-1].chunk_ordinal,
            )
        )
    return findings
