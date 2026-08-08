"""The versioned chunk profile (CRPS-03 deliverables 1, 4 and 6).

THE CONSTANTS BELOW ARE DOCUMENTED INITIAL DEFAULTS, NOT PRODUCT RULES
---------------------------------------------------------------------
PRD §1 marks chunk sizing **benchmark-selected**: *"parameters are intentionally not fixed until
representative corpus and evaluation results exist"*, and PRD §45.1 item 5 forbids silently turning
an initial default into a new product rule. Sub-PRD open question **Q-CRPS-1** owns the numbers; the
measured evidence comes from `RETR-10` / `GOLD-16`.

Basis for the starting values, recorded so a later reader can see they are reasoned rather than
measured:

* PRD §17.2 plans for approximately 600,000–1,000,000 structurally consolidated search chunks over
  approximately 300,000 documents — an order-of-magnitude bound that a ~1,200-character target sits
  inside, not a size decision.
* PRD §36.2 budgets a Quick evidence pack at 12 evidence nodes / 32,000 characters for one hosted
  call, so a chunk must stay well under a small fraction of that budget to let several pieces of
  evidence travel together; `max_chars = 2000` keeps 12 chunks inside 24,000 characters.
* `overlap_chars = 0` is deliberate rather than unset: overlapping chunks produce duplicate evidence
  spans, and PRD §36.2 requires deduplicated evidence.

Changing any number here requires measured evidence per PRD §45.5, a bump of `CHUNKER_VERSION`, and
a writeback to Q-CRPS-1 plus deliverable 4 of the CRPS-03 ticket. It is never a free code edit:
`CHUNKER_VERSION` is published as `versions.chunker` in the release manifest (PRD §18.4), so a
boundary change changes release identity.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Final, Literal

from contracts.validate import sha256_hex

from .segment import SEGMENTER_VERSION

__all__ = [
    "CHUNKER_VERSION",
    "DEFAULT_PROFILE",
    "ChunkProfile",
    "profile_fingerprint",
]

#: Semver. Published as `versions.chunker` in the release manifest (PRD §18.4). ANY change to
#: boundary behaviour — here, in `segment`, or in `chunker` — bumps it.
CHUNKER_VERSION: Final[str] = "1.0.0"

_SPLIT_STRATEGIES: Final[frozenset[str]] = frozenset({"sentence", "paragraph", "hard"})


@dataclass(frozen=True, slots=True)
class ChunkProfile:
    """The complete set of knobs that can move a chunk boundary. Frozen: a profile is identity."""

    profile_id: str
    target_chars: int
    max_chars: int
    min_chars: int
    overlap_chars: int
    consolidate_within_provision: bool
    split_strategy: Literal["sentence", "paragraph", "hard"]

    def __post_init__(self) -> None:
        """Reject a profile that cannot produce well-formed chunks, at construction.

        A profile whose packing loop cannot terminate, or whose overlap swallows a whole chunk,
        would otherwise show up as silently wrong offsets in a rebuilt corpus.
        """
        if not self.profile_id:
            raise ValueError("profile_id must be a non-empty string")
        if not 0 < self.min_chars <= self.target_chars <= self.max_chars:
            raise ValueError(
                "a profile must satisfy 0 < min_chars <= target_chars <= max_chars, got "
                f"min_chars={self.min_chars}, target_chars={self.target_chars}, "
                f"max_chars={self.max_chars}"
            )
        if not 0 <= self.overlap_chars < self.min_chars:
            raise ValueError(
                "a profile must satisfy 0 <= overlap_chars < min_chars, got "
                f"overlap_chars={self.overlap_chars}, min_chars={self.min_chars}"
            )
        if self.split_strategy not in _SPLIT_STRATEGIES:
            raise ValueError(
                f"split_strategy {self.split_strategy!r} is not one of "
                f"{sorted(_SPLIT_STRATEGIES)}"
            )


#: The documented initial defaults of deliverable 4. See the module docstring before changing one.
DEFAULT_PROFILE: Final[ChunkProfile] = ChunkProfile(
    profile_id="chunk-default-v1",
    target_chars=1200,
    max_chars=2000,
    min_chars=200,
    overlap_chars=0,
    consolidate_within_provision=True,
    split_strategy="sentence",
)


def profile_fingerprint(profile: ChunkProfile) -> str:
    """A stable 64-hex digest over everything that can move a boundary.

    Recorded alongside produced chunks so a mismatch between the chunks in a release and the profile
    that would be used to rebuild them is detectable rather than silent. The members are listed
    explicitly rather than reflected: adding a member to `ChunkProfile` must be a deliberate act that
    also decides whether it belongs in the identity of a chunk set.
    """
    document = {
        "chunker_version": CHUNKER_VERSION,
        "segmenter_version": SEGMENTER_VERSION,
        "profile": {
            "profile_id": profile.profile_id,
            "target_chars": profile.target_chars,
            "max_chars": profile.max_chars,
            "min_chars": profile.min_chars,
            "overlap_chars": profile.overlap_chars,
            "consolidate_within_provision": profile.consolidate_within_provision,
            "split_strategy": profile.split_strategy,
        },
    }
    return sha256_hex(
        json.dumps(document, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    )
