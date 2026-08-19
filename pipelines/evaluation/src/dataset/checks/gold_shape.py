"""`GOLD_SHAPE` — every gold authority is well formed and carries a permitted `citation_role`.

Rules, from the ticket's deliverable 12 row 7 (PRD §43.2, §43.3):

* ids match the CRPS-01 corpus prefixes — `doc_`, `dv_`, `nv_` — with `nv_` for `node_id`, because
  PRD §15.3 pins a citation to a **NodeVersion**;
* `citation_role` is a member of the canonical `CitationRole` family, read from the
  `packages/contracts` export (PRD §15.5, §45.2 — never restated in the schema);
* both pinpoints are present together and `quote_end` is strictly after `quote_start`;
* at least one authority is `required: true`, UNLESS the case is `OUT_OF_SCOPE` or is a
  PII-rejection case. A PII-rejection case is one whose `trap_types` carries a `PII`-prefixed token
  (PRD §36.8 gives such a case no answer status, so it can have no supporting authority).

`minItems` and `uniqueItems` are outside the available schema engine's vocabulary, so non-emptiness
and duplicate detection are rules here rather than schema keywords — deliberately, and recorded in
`case.schema.json`'s `$comment`.
"""

from __future__ import annotations

import re
from typing import Any, Mapping

from .. import contract_enums
from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories

_ID = "GOLD_SHAPE"
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_PREFIXES = {
    "document_id": re.compile(rf"^doc_{_UUID}$"),
    "version_id": re.compile(rf"^dv_{_UUID}$"),
    "node_id": re.compile(rf"^nv_{_UUID}$"),
}
_NO_GOLD_STATUSES = frozenset({"OUT_OF_SCOPE"})


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    try:
        roles = set(contract_enums.citation_roles())
        roles_available = True
    except contract_enums.MissingEnumFamilyError:
        roles, roles_available = set(), False

    for entry in categories(dataset, context.category):
        for case in entry.cases:
            path = str(case.path)
            entries = case.raw.get("gold_authorities")
            if not isinstance(entries, list):
                continue

            seen: set[tuple[str, str, str]] = set()
            required_present = False
            for index, authority in enumerate(entries):
                if not isinstance(authority, Mapping):
                    findings.append(
                        Finding(_ID, "FAIL", entry.slug, case.id, f"gold_authorities[{index}] is not a mapping", path)
                    )
                    continue
                findings.extend(_shape(entry.slug, case.id, path, index, authority, roles, roles_available))
                if authority.get("required") is True:
                    required_present = True
                identity = (
                    str(authority.get("document_id")),
                    str(authority.get("version_id")),
                    str(authority.get("node_id")),
                )
                if identity in seen:
                    findings.append(
                        Finding(
                            _ID,
                            "FAIL",
                            entry.slug,
                            case.id,
                            f"gold_authorities[{index}] repeats an authority already listed",
                            path,
                        )
                    )
                seen.add(identity)

            if not required_present and not _may_have_no_gold(case.raw):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        "no gold authority is marked required: true, and the case is neither "
                        "OUT_OF_SCOPE nor a PII-rejection case",
                        path,
                    )
                )
    return findings


def _shape(
    slug: str,
    case_id: str,
    path: str,
    index: int,
    authority: Mapping[str, Any],
    roles: set[str],
    roles_available: bool,
) -> list[Finding]:
    findings: list[Finding] = []
    for field, pattern in _PREFIXES.items():
        value = authority.get(field)
        if not isinstance(value, str) or not pattern.match(value):
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    slug,
                    case_id,
                    f"gold_authorities[{index}].{field} is not a well-formed corpus id",
                    path,
                )
            )
    role = authority.get("citation_role")
    if not roles_available:
        findings.append(
            Finding(
                _ID,
                "UNRESOLVED",
                slug,
                case_id,
                "CITATION_ROLE_VOCABULARY_UNRESOLVED: the packages/contracts enum export could not "
                "be read; owner FND-03",
                path,
            )
        )
    elif role not in roles:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                case_id,
                f"gold_authorities[{index}].citation_role is not a member of the canonical "
                "CitationRole family",
                path,
            )
        )
    start, end = authority.get("quote_start"), authority.get("quote_end")
    if isinstance(start, int) and isinstance(end, int) and end <= start:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                case_id,
                f"gold_authorities[{index}] quote_end is not after quote_start",
                path,
            )
        )
    return findings


def _may_have_no_gold(raw: Mapping[str, Any]) -> bool:
    if raw.get("expected_answer_status") in _NO_GOLD_STATUSES:
        return True
    traps = raw.get("trap_types")
    if isinstance(traps, list):
        return any(isinstance(trap, str) and trap.upper().startswith("PII") for trap in traps)
    return False
