"""Which `legal_event` types REQUIRE an `effective_date` (CRPS-06 deliverable 4.2).

THE PROBLEM THIS MODULE EXISTS TO SOLVE HONESTLY. Deliverable 4.2 requires *"every
`legal_event.effective_date` is present where the event type requires it"* — but
`legal_event.event_type` has no published enum family: it is declared `pending` in
`schema/corpus/002_enums.map.json`, the column carries no CHECK, and `packages/contracts` publishes
nothing for it (Q-CRPS-4 / FND-03). Hand-copying a vocabulary and presenting it as the contract is
expressly forbidden by CRPS-01's Feedback obligation.

So the rule is declared here, in the open, as THIS MODULE'S OWN mapping over the event types it
recognises — and an event type it does not recognise produces an INFO finding
(`TIME_EVENT_TYPE_UNRECOGNISED`) rather than a silent pass. "Not checked" and "checked and fine"
never look the same in the report.

The distinction the mapping draws is PRD §15.2's: an event that CHANGES THE LAW'S OPERATION from a
date (commencement, repeal, a variation taking effect) is not meaningful without that date, whereas
an event that merely RECORDS A STEP in a process (introduction, passage, assent, publication) has an
`event_date` and legitimately has no separate effective date.

When FND-03 publishes the family, this mapping is replaced by one keyed on it, and that is a ticket
change against CRPS-06 — not a refactor.
"""

from __future__ import annotations

from typing import Final, Mapping

__all__ = ["EFFECTIVE_DATE_REQUIRED", "requirement_for"]

#: `event_type -> whether an effective_date is required`. Spellings are the ones already in use in
#: this repository's seed helpers (`tests/schema/corpus_seed.py`, `fixtures/generator/`), which is
#: the same source `synthetic_corpus.py` records using — not a competing vocabulary invented here.
EFFECTIVE_DATE_REQUIRED: Final[Mapping[str, bool]] = {
    # Operative: the law's effect moves on this date, so the date is the content of the event.
    "COMMENCEMENT": True,
    "REPEAL": True,
    "AMENDMENT": True,
    "VARIATION": True,
    "SUPERSESSION": True,
    "CONSOLIDATION": True,
    # Procedural: the step happened on `event_date` and changes no operative date by itself.
    "INTRODUCTION": False,
    "PASSAGE": False,
    "ASSENT": False,
    "PUBLICATION": False,
    "MADE": False,
    "DISALLOWANCE": False,
    "CONSULTATION": False,
}


def requirement_for(event_type: str) -> bool | None:
    """`True`/`False` when the type is recognised, `None` when it is not.

    `None` is what makes an unrecognised type reportable rather than silently passed.
    """
    return EFFECTIVE_DATE_REQUIRED.get(event_type)
