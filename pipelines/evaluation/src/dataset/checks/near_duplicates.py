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
`CheckContext.opened_blind`. `GOLD-15`/`GOLD-17` supply it; nothing else can.

WHEN NO OPENED MATERIAL IS PRESENT, THE TWO BLIND-INVOLVING SPLIT PAIRS ARE REPORTED `UNRESOLVED`,
ONE FINDING EACH — `DEVELOPMENT / BLIND` and `VALIDATION / BLIND`. An earlier revision emitted
nothing there, reasoning that an UNRESOLVED on every ordinary run trains readers to ignore it. That
reasoning is real but it buys the wrong thing: silence makes `verify` report a clean result for a
comparison it never made, and "the product was tuned on a question that is also in the blind set"
is the single failure that makes the whole blind split worthless. This check is the ticket's
`EVAL-001` evidence, and evidence that quietly covers two thirds of the pairs is not evidence.

It is also the house rule rather than an exception: sub-PRD D11 makes UNRESOLVED never a pass,
`GOLD_RESOLVES` reports UNRESOLVED for every gold entry when no `--release` is pinned, and
`SCHEMA_VALID` does the same for the jurisdiction vocabulary. A correct dataset therefore has no
FAIL from this check — which is what "passes" means for a check that reports what it could not see.
The finding names the pair and the counts and nothing else.
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

    if context.opened_blind:
        findings.extend(_against_opened_blind(context, seen))
    else:
        findings.extend(_unresolved_blind_pairs(dataset, context))
    return findings


#: The two split pairs no key-less run can compare. Ordered as rendered, so a reader sees the same
#: string every time and can grep for it.
_BLIND_PAIRS = ("DEVELOPMENT / BLIND", "VALIDATION / BLIND")


def _unresolved_blind_pairs(dataset: Dataset, context: CheckContext) -> list[Finding]:
    """One UNRESOLVED per blind-involving pair — never a pass, and never silence.

    Skipped entirely when the dataset holds no blind slots at all: a pair that cannot exist is not
    a pair that could not be checked, and inventing a finding for it would be the noise this
    module's header is otherwise careful to avoid.
    """
    scoped = list(categories(dataset, context.category))
    blind_slots = sum(len(entry.sidecars) for entry in scoped)
    if not blind_slots:
        return []
    visible = sum(len(entry.cases) for entry in scoped)
    return [
        Finding(
            _ID,
            "UNRESOLVED",
            "<dataset>",
            None,
            f"BLIND_PAIR_UNCOMPARABLE: split pair {pair} was not compared — a BLIND question exists "
            f"in this repository only as ciphertext ({blind_slots} sealed slot(s) against {visible} "
            "visible case(s)). Only a Founder-started blind stage, which holds the private key and "
            "supplies opened material, can resolve it (sub-PRD D1, D11; GOLD-15/GOLD-17)",
            None,
        )
        for pair in _BLIND_PAIRS
    ]


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
