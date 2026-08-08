"""Cross-check `jsonschema_min` against the real library WHEN IT HAPPENS TO BE INSTALLED.

`jsonschema` is declared in `pipelines/corpus-builder/pyproject.toml` but is not present in the
environment `uv sync --frozen` builds (a uv workspace member that is `package = false` contributes
no dependency to it — CRPS-01's E1). So this is a skipped test today, and never a hard dependency:
the schemas must be validatable with a generic 2020-12 validator, and this proves it whenever one is
available rather than asserting it in prose.
"""

from __future__ import annotations

import copy

import pytest
from manifest_fixtures import read_manifest

from manifest.paths import schema_documents
from manifest.verify import RELEASE_SCHEMA_ID

jsonschema = pytest.importorskip("jsonschema", reason="jsonschema is not installed (CRPS-01 E1)")


def _library_validator():
    documents = schema_documents(1)
    registry_resource = {uri: document for uri, document in documents.items()}
    resolver = jsonschema.validators.RefResolver(  # type: ignore[attr-defined]
        base_uri=RELEASE_SCHEMA_ID, referrer=documents[RELEASE_SCHEMA_ID], store=registry_resource
    )
    return jsonschema.Draft202012Validator(documents[RELEASE_SCHEMA_ID], resolver=resolver)


def _min_validator():
    from contracts.jsonschema_min import Draft202012Validator

    documents = schema_documents(1)
    return Draft202012Validator(documents[RELEASE_SCHEMA_ID], documents=documents)


def test_both_engines_accept_a_valid_manifest(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    assert _library_validator().is_valid(document)
    assert list(_min_validator().iter_errors(document)) == []


@pytest.mark.parametrize("member", ["counts", "runtime", "local_models", "manifest_sha256"])
def test_both_engines_reject_the_same_defect(bundle_factory, member: str) -> None:
    document = copy.deepcopy(read_manifest(bundle_factory()))
    del document[member]
    assert not _library_validator().is_valid(document)
    assert list(_min_validator().iter_errors(document))
