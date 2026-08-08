"""Typed, fail-closed errors for the tier-assignment policy (CRPS-04).

PRD §11.1 / §12.2: an unknown or unassessed licence must never silently default to a permissive
tier. Every error below exists because it has an obvious permissive alternative that MUST NOT
exist — a `dict.get(..., PERMITTED)`, a `getattr(..., default)` or an "assume T1".
"""

from __future__ import annotations

__all__ = [
    "InvalidTieringInput",
    "MissingTieringInput",
    "TieringError",
    "UnknownLicenceState",
    "UnknownSourceTier",
]


class TieringError(Exception):
    """Base class for every tier-assignment failure. Always fail closed, never a default tier."""


class UnknownLicenceState(TieringError):
    """The licence assessment is unknown, absent or not independently stated.

    Raised when `licence_status` is not a `LicenceStatus` member (including `None` and `""`), or
    when any of the three `licence_permits_*` decisions is not a `bool` (`None` = "not assessed").
    PRD §11.1 requires the storage/indexing/embedding decisions to be stated independently; PRD
    §12.2 puts licensing ambiguity into quarantine rather than into a permissive default.
    """


class UnknownSourceTier(TieringError):
    """`source_initial_tier` is not one of `T1` / `T2` / `T3` (PRD §40.1). Never defaults to `T1`."""


class InvalidTieringInput(TieringError):
    """A structurally invalid input record: a non-boolean flag or a negative character count."""


class MissingTieringInput(TieringError):
    """A chunk's `node_version_id` has no `TieringInput`.

    Fail closed: an unassessed node is not "assume permitted", it is a build error.
    """
