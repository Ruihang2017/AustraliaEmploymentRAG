"""`NO_NEAR_DUPLICATES` — no two cases share a normalised `question` + `anonymous_scenario`.

Why it matters (PRD §14.1, §14.3): a question that appears in both DEVELOPMENT and BLIND makes the
blind result meaningless, because the product was tuned against it. Duplication WITHIN a split is
also reported — it wastes a slot in a table whose counts are exact.

WHAT THIS CHECK CAN AND CANNOT SEE, stated plainly because the boundary is a design consequence and
not an omission. A BLIND case's question exists in this repository only as ciphertext, so no
key-less check can compare it against anything. This is the same consequence the ADR records:
`GOLD-05` … `GOLD-14` can verify blind SLOTS — count, seal, digest, sidecar allowlist and
stratification — never content. Blind-versus-visible duplication is therefore checkable in exactly
one place: a Founder-started blind stage, which holds the key and passes the opened material in
`CheckContext.opened_blind`. When that tuple is empty this check compares the visible cases only,
and it does NOT emit an UNRESOLVED for the blind ones — an UNRESOLVED on every ordinary run would
train every reader to ignore it, and the ticket requires this check to pass on a correct dataset.
`GOLD-15`/`GOLD-17` supply `opened_blind`; nothing else can.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Mapping

from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories

_ID = "NO_NEAR_DUPLICATES"
_WORD = re.compile(r"[0-9a-z]+")


def _fingerprint(raw: Mapping[str, Any]) -> str | None:
    question = raw.get("question")
    scenario = raw.get("anonymous_scenario")
    if not isinstance(question, str) or not isinstance(scenario, str):
        return None
    text = unicodedata.normalize("NFKC", f"{question}\n{scenario}").casefold()
    tokens = _WORD.findall(text)
    return " ".join(tokens) if tokens else None


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    scoped = {entry.slug for entry in categories(dataset, context.category)}
    seen: dict[str, tuple[str, str, str, str]] = {}

    for entry in dataset.categories:
        for case in entry.cases:
            fingerprint = _fingerprint(case.raw)
            if fingerprint is None:
                continue
            previous = seen.get(fingerprint)
            if previous is None:
                seen[fingerprint] = (case.id, case.split, entry.slug, str(case.path))
                continue
            other_id, other_split, other_slug, _other_path = previous
            if entry.slug not in scoped and other_slug not in scoped:
                continue
            pair = " / ".join(sorted({case.split, other_split}))
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    case.id,
                    f"question + anonymous_scenario is a duplicate of case {other_id} in category "
                    f"{other_slug}; split pair {pair}",
                    str(case.path),
                )
            )

    findings.extend(_against_opened_blind(context, seen))
    return findings


def _against_opened_blind(
    context: CheckContext, seen: dict[str, tuple[str, str, str, str]]
) -> list[Finding]:
    """Only a Founder-started blind stage ever reaches this branch (see the module header)."""
    findings: list[Finding] = []
    for sealed in context.opened_blind:
        document = sealed.document_for_runner()  # type: ignore[attr-defined]
        if not isinstance(document, Mapping):
            continue
        fingerprint = _fingerprint(document)
        if fingerprint is None:
            continue
        previous = seen.get(fingerprint)
        if previous is None:
            continue
        other_id, other_split, other_slug, _path = previous
        findings.append(
            Finding(
                _ID,
                "FAIL",
                other_slug,
                sealed.case_id(),  # type: ignore[attr-defined]
                f"blind case duplicates visible case {other_id}; split pair BLIND / {other_split}",
                None,
            )
        )
    return findings
