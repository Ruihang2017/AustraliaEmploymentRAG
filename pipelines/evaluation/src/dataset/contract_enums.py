"""The canonical enum vocabulary this dataset references — read, never restated.

OWNER. `packages/contracts` (`FND-03`) publishes the canonical families; `contracts.enums`
(`CRPS-01`) is the reader. This module is a thin adapter over it, and the only other file in this
package that touches another member's `src` (see `schema_engine.py`).

WHY MEMBERSHIP IS ENFORCED HERE AND NOT IN THE SCHEMA. PRD §45.2 forbids a duplicated rule and PRD
§44.3 makes `packages/contracts` serial-owned, so `schemas/evaluation/case.schema.json` carries NO
member literal for a canonical family — only `type: string` and a `$comment` naming the family. The
`SCHEMA_VALID` check reads the export at run time, which makes an `FND-03` change a test failure
here rather than a silent divergence. That is what "references, never restates" means mechanically.

THE MISSING FAMILY. `packages/contracts` publishes no `Jurisdiction` family (PRD §6.3 names the
states in prose and fixes no codes; the corpus schema types `jurisdiction` as a bare non-empty
string). `jurisdictions` is therefore shape-validated here and reported `UNRESOLVED`, never passed
and never given a locally-invented enum — GOLD-01's Feedback obligation 2 routes that to a docs PR
against `FND-03`. Sub-PRD open item recorded in `docs/prd/21-evaluation-600/README.md`.
"""

from __future__ import annotations

import re
import sys

from .paths import REPO_ROOT

_CORPUS_BUILDER_SRC = str(REPO_ROOT / "pipelines" / "corpus-builder" / "src")
if _CORPUS_BUILDER_SRC not in sys.path:
    sys.path.insert(0, _CORPUS_BUILDER_SRC)

from contracts.enums import (  # noqa: E402
    MissingEnumFamilyError,
    enum_values,
    load_contract_enums,
)

__all__ = [
    "JURISDICTION_FAMILY_ABSENT",
    "JURISDICTION_SHAPE",
    "MissingEnumFamilyError",
    "answer_statuses",
    "citation_roles",
    "enum_values",
    "load_contract_enums",
]

#: The message the `UNRESOLVED` jurisdiction finding carries. Names the owner and carries no content.
JURISDICTION_FAMILY_ABSENT = (
    "packages/contracts publishes no Jurisdiction enum family, so jurisdiction membership cannot be "
    "resolved; shape is validated instead. Owner: FND-03 (docs PR), recorded in "
    "docs/prd/21-evaluation-600/README.md. Never define a second copy of a canonical enum here."
)

#: Shape a jurisdiction token must have while the canonical family is absent: an upper-case code.
JURISDICTION_SHAPE = re.compile(r"^[A-Z][A-Z0-9_]{1,15}$")


def answer_statuses() -> tuple[str, ...]:
    """PRD §8.4 `AnswerStatus`, from the canonical export."""
    return enum_values("AnswerStatus")


def citation_roles() -> tuple[str, ...]:
    """PRD §15.5 `CitationRole`, from the canonical export."""
    return enum_values("CitationRole")
