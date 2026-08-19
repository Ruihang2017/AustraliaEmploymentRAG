"""Every evaluation schema stays inside the vocabulary the available engine can enforce.

`contracts.jsonschema_min` raises `UnsupportedKeywordError` on a keyword outside its supported set,
on the principle that a schema it cannot fully enforce must never be reported as satisfied. This
test is what keeps a future editor of `schemas/evaluation/**` inside that vocabulary: adding
`minItems`, `uniqueItems` or `format` fails here rather than at some downstream ticket's run.
"""

from __future__ import annotations

import json

import dataset_fixtures  # noqa: F401
import pytest
from dataset import schema_engine
from dataset.paths import SCHEMAS_DIR

_UNAVAILABLE = (
    "minItems",
    "maxItems",
    "uniqueItems",
    "format",
    "propertyNames",
    "patternProperties",
    "contains",
    "prefixItems",
    "unevaluatedProperties",
    "$dynamicRef",
)


@pytest.mark.parametrize("name", schema_engine.SCHEMA_FILES)
def test_schema_file_exists(name: str) -> None:
    assert (SCHEMAS_DIR / name).is_file()


@pytest.mark.parametrize("name", schema_engine.SCHEMA_FILES)
def test_schema_validates_a_document_without_unsupported_keyword_error(name: str) -> None:
    validator = schema_engine.validator_for(name)
    # Three shapes that exercise the top-level type branch and every keyword on the way to it.
    for probe in ({}, {"unexpected": 1}, []):
        try:
            validator.validate(probe)
        except schema_engine.ValidationError:
            pass


@pytest.mark.parametrize("name", schema_engine.SCHEMA_FILES)
def test_schema_uses_no_keyword_the_engine_cannot_enforce(name: str) -> None:
    text = (SCHEMAS_DIR / name).read_text(encoding="utf-8")
    for keyword in _UNAVAILABLE:
        assert f'"{keyword}"' not in text, (
            f"{name} uses {keyword!r}, which contracts.jsonschema_min does not implement. Express "
            "the constraint in pipelines/evaluation/src/dataset/checks/** with its own finding id, "
            "or raise it against 04-corpus-contract — never fork the engine."
        )


@pytest.mark.parametrize("name", schema_engine.SCHEMA_FILES)
def test_schema_declares_its_own_id_and_draft(name: str) -> None:
    document = json.loads((SCHEMAS_DIR / name).read_text(encoding="utf-8"))
    assert document["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert document["$id"] == f"https://taxrag.local/schema/evaluation/{name}"
    assert document["$comment"], "each schema records why its vocabulary is restricted"


def test_cross_document_refs_resolve_offline() -> None:
    """`case.schema.json` refers to `gold-authority.schema.json`; nothing is ever fetched."""
    validator = schema_engine.validator_for("case.schema.json")
    with pytest.raises(schema_engine.ValidationError):
        validator.validate(
            {
                "id": "EVAL-FED-001",
                "gold_authorities": [{"document_id": "not-an-id"}],
            }
        )
