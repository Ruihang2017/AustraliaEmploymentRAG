"""Shared helpers for the check modules. No rule lives here — rules live in their own module."""

from __future__ import annotations

import datetime
from typing import Iterator

from ..model import Category, Dataset

__all__ = ["categories", "is_real_calendar_date", "records"]


def categories(dataset: Dataset, category: str | None) -> tuple[Category, ...]:
    """The categories in scope, honouring `--category <slug>`."""
    if category is None:
        return dataset.categories
    return tuple(entry for entry in dataset.categories if entry.slug == category)


def records(entry: Category) -> Iterator[tuple[str, str, str, object]]:
    """Yield `(case_id, split, path, raw)` for every case AND every blind sidecar in *entry*.

    A blind case has no case file, so a check that iterated only `entry.cases` would silently skip
    a fifth of the dataset. Every check that can run on the allowlisted sidecar fields uses this.
    """
    for case in entry.cases:
        yield case.id, case.split, str(case.path), case.raw
    for sidecar in entry.sidecars:
        yield sidecar.id, "BLIND", str(sidecar.path), sidecar.raw


def is_real_calendar_date(text: str) -> bool:
    """`case.schema.json`'s `pattern` accepts 2026-02-30; the calendar does not.

    `format: date` is outside the vocabulary the available engine implements, so this constraint is
    a check rather than a schema keyword — deliberately, and recorded in the schema's `$comment`.
    """
    try:
        datetime.date.fromisoformat(text)
    except (TypeError, ValueError):
        return False
    return True
