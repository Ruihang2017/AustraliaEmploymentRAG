"""`NodeVersionInput` — the chunker's view of one `node_version` (CRPS-03 deliverable 2).

The member set is derived from the boundary rules that must be evaluable, and from nothing else:
every member below is read by rule 5.3, 5.4, 5.5 or 5.6, and nothing that no rule reads is carried.

Why this is not `contracts.records.NodeVersion` itself: an intermediate normalised record carries
NATURAL KEYS only (PRD §40.7, CRPS-01 deliverable 11) — `stable_source_key` / `version_label` /
`stable_node_key` — whereas a `search_chunk` row references `node_version.id`, a corpus primary key
minted by the builder. `node_kind` likewise lives on the `document_node` record, not on
`node_version`. `from_inr()` is the bridge: it takes the INR payload model plus the four values the
builder alone knows, and never invents an identifier of its own.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from contracts.records import NodeVersion

__all__ = ["NodeVersionInput"]


@dataclass(frozen=True, slots=True)
class NodeVersionInput:
    """One node version, ready to chunk. Frozen: chunking never mutates its input."""

    node_version_id: str
    document_version_id: str
    parent_node_version_id: str | None
    ordinal: int
    node_kind: str
    canonical_text: str
    heading: str | None = None
    display_label: str | None = None

    def __post_init__(self) -> None:
        """Enforce the two CRPS-01 preconditions this module's offsets rest on.

        `canonical_text` is NFC-normalised exactly once, at `normalise()` (CRPS-01 deliverable 12).
        Accepting non-NFC text here would make every offset this module emits unreproducible against
        the stored text, which is exactly what `SRCH-003` forbids — so it fails loudly instead.
        """
        if self.ordinal < 0:
            raise ValueError(f"ordinal must be non-negative, got {self.ordinal}")
        if unicodedata.normalize("NFC", self.canonical_text) != self.canonical_text:
            raise ValueError(
                f"canonical_text of {self.node_version_id!r} is not Unicode-NFC-normalised; "
                "CRPS-01 deliverable 12 normalises once, at normalise(), and chunk offsets index "
                "the normalised text"
            )

    @classmethod
    def from_inr(
        cls,
        record: NodeVersion,
        *,
        node_version_id: str,
        document_version_id: str,
        parent_node_version_id: str | None,
        node_kind: str,
    ) -> NodeVersionInput:
        """Build from a CRPS-01 `node_version` INR payload plus the builder-minted corpus IDs.

        The four keyword arguments are supplied by the caller precisely because they are NOT in the
        record: minting or guessing an identifier here would put a corpus primary key inside the
        record contract, which CRPS-01 deliverable 11 forbids.
        """
        return cls(
            node_version_id=node_version_id,
            document_version_id=document_version_id,
            parent_node_version_id=parent_node_version_id,
            ordinal=record.ordinal,
            node_kind=node_kind,
            canonical_text=record.canonical_text,
            heading=record.heading,
            display_label=record.display_label,
        )
