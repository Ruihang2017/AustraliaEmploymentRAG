"""The JSON-Schema engine this package validates cases with — CRPS-01's, never a second copy.

OWNER. `contracts.jsonschema_min` belongs to `04-corpus-contract` (`CRPS-01`). This module is a
thin adapter: it puts that member's `src` on `sys.path` and re-exports. It is one of exactly two
files in this package that reach into another member's tree (the other is `contract_enums.py`), so
the coupling is one `grep` away. Precedent for a cross-member read-only import:
`pipelines/corpus-builder/fixtures/generator/_paths.py`.

CONSEQUENCE FOR THE SCHEMAS THIS TICKET AUTHORS. That validator implements a deliberate subset and
raises `UnsupportedKeywordError` for anything outside it — so `schemas/evaluation/*.json` is
authored strictly within `$ref`, `$defs`, `type`, `enum`, `const`, `required`, `properties`,
`additionalProperties`, `items`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `not`,
`allOf`, `anyOf`, `oneOf`, `if`/`then`/`else`, `dependentRequired`. Constraints that would need
`minItems`, `uniqueItems` or `format` live in `checks/**` instead, where each has its own finding
id and its own negative fixture. `tests/dataset/test_schema_vocabulary.py` is what keeps a future
editor inside the vocabulary. Extending the engine is `04-corpus-contract`'s change, not ours.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .paths import REPO_ROOT, SCHEMAS_DIR

_CORPUS_BUILDER_SRC = str(REPO_ROOT / "pipelines" / "corpus-builder" / "src")
if _CORPUS_BUILDER_SRC not in sys.path:
    sys.path.insert(0, _CORPUS_BUILDER_SRC)

from contracts.jsonschema_min import (  # noqa: E402
    Draft202012Validator,
    UnsupportedKeywordError,
    ValidationError,
    load_documents,
)

__all__ = [
    "Draft202012Validator",
    "SCHEMA_FILES",
    "UnsupportedKeywordError",
    "ValidationError",
    "load_documents",
    "schema_documents",
    "validator_for",
]

#: The seven schema files this ticket owns, in deliverable order.
SCHEMA_FILES: tuple[str, ...] = (
    "case.schema.json",
    "gold-authority.schema.json",
    "stratification.schema.json",
    "blind-envelope.schema.json",
    "blind-sidecar.schema.json",
    "dataset-version.schema.json",
    "dataset-migration.schema.json",
)


def schema_paths(schemas_dir: Path | None = None) -> tuple[Path, ...]:
    base = schemas_dir or SCHEMAS_DIR
    return tuple(base / name for name in SCHEMA_FILES)


def schema_documents(schemas_dir: Path | None = None) -> dict[str, Any]:
    """Every evaluation schema, keyed by its own `$id`, ready for cross-document `$ref`."""
    return load_documents(schema_paths(schemas_dir))


def validator_for(name: str, schemas_dir: Path | None = None) -> Draft202012Validator:
    """A validator for `schemas/evaluation/<name>`, with every sibling schema resolvable."""
    base = schemas_dir or SCHEMAS_DIR
    schema = json.loads((base / name).read_text(encoding="utf-8"))
    return Draft202012Validator(schema, documents=schema_documents(base))
