"""The emitted instance validates against CRPS-02's `embedding-manifest.schema.json`.

The ticket's `[fixture]` criterion: "If `schemas/corpus-manifest/v1/embedding-manifest.schema.json`
exists in the worktree, the emitted instance validates against it; if it does not exist, the test
records a skip WITH A MESSAGE NAMING `CRPS-02` rather than passing silently."

In this checkout CRPS-02 is merged and the schema IS present, so these tests PASS rather than skip.
The skip branch is kept for the worktree where it is absent — that is the branch the ticket
describes, and removing it would make this file depend on a ticket this one is deliberately not
`blocked_by`.

Validation runs through `contracts.jsonschema_min.Draft202012Validator` — CRPS-01's pure-Python
Draft 2020-12 validator — so it needs no `jsonschema` package and touches no network.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from contracts.jsonschema_min import Draft202012Validator
from embedding_fixtures import CorpusFixture
from embeddings.profile import PinnedProfile
from test_embed_pins import REQUIRED_MEMBERS, stub_build

CRPS02_SKIP = (
    "schemas/corpus-manifest/v1/embedding-manifest.schema.json is not present in this worktree; "
    "CRPS-02 owns that schema (PRD §44.3 serial-owned) and this ticket is deliberately not "
    "blocked_by it, so the instance is checked against deliverable 4's literal member list instead"
)


def _schema_documents():
    from manifest.paths import schema_documents

    try:
        return schema_documents(1)
    except FileNotFoundError:
        pytest.skip(CRPS02_SKIP)


def _embedding_schema():
    from manifest.verify import EMBEDDING_SCHEMA_ID

    documents = _schema_documents()
    if EMBEDDING_SCHEMA_ID not in documents:
        pytest.skip(CRPS02_SKIP)
    return documents, documents[EMBEDDING_SCHEMA_ID]


def test_the_schema_is_present_in_this_checkout() -> None:
    """A guard on the guard: if this skips, every assertion below is vacuous and says so."""
    documents, schema = _embedding_schema()
    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False


def test_the_emitted_instance_validates(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    documents, schema = _embedding_schema()
    document = stub_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    errors = list(Draft202012Validator(schema, documents=documents).iter_errors(document))
    assert errors == [], "\n".join(str(error) for error in errors)


def test_the_emitted_key_set_equals_the_schemas_required_set(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """Catches a stray or missing member before the validator's message gets long."""
    _, schema = _embedding_schema()
    document = stub_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    assert set(document) == set(schema["required"])


def test_deliverable_4s_literal_list_agrees_with_the_schema() -> None:
    """THE one place the ticket's list and the schema's list are compared.

    The ticket says: on divergence the SCHEMA WINS and the divergence is a writeback. This test is
    what would surface such a divergence rather than letting the instance drift to match whichever
    was consulted last.
    """
    _, schema = _embedding_schema()
    assert sorted(REQUIRED_MEMBERS) == sorted(schema["required"])


def test_a_manifest_missing_a_required_member_is_rejected_by_the_validator(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """A positive control: an always-passing validator would make this whole file vacuous."""
    documents, schema = _embedding_schema()
    document = stub_build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    document.pop("runtime")
    assert list(Draft202012Validator(schema, documents=documents).iter_errors(document)) != []
