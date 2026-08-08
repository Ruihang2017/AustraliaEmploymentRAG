"""Acceptance item 14 (sub-PRD D15) — this ticket adds NO path to PRD §18.4's fixed layout.

The manifest pins model artefact IDENTITY. Putting model weight bytes inside the bundle would add a
sixth path to a layout PRD §18.4 fixes, which is a plan/PRD writeback, not a ticket change.
`ModelPin.bundle_path` exists so the manifest can express either outcome once it is decided
elsewhere — and `null` must be accepted today.
"""

from __future__ import annotations

from dataclasses import replace

from manifest_fixtures import document_pin, read_manifest

from contracts.jsonschema_min import Draft202012Validator
from manifest import BUNDLE_LAYOUT, PRD_BUNDLE_PATHS, verify_bundle
from manifest.paths import schema_documents
from manifest.verify import RELEASE_SCHEMA_ID

#: PRD §18.4, transcribed here as a literal so a code change cannot quietly grow the layout.
PRD_18_4_LAYOUT = (
    "corpus.sqlite",
    "tantivy/",
    "vectors.usearch",
    "embedding-manifest.json",
    "release-manifest.json",
)


def test_the_layout_is_exactly_the_five_documented_entries() -> None:
    assert BUNDLE_LAYOUT == PRD_18_4_LAYOUT
    assert PRD_BUNDLE_PATHS == PRD_18_4_LAYOUT
    assert len(PRD_18_4_LAYOUT) == 5


def test_a_clean_bundle_contains_exactly_the_layout_and_nothing_else(bundle_factory) -> None:
    bundle = bundle_factory()
    top_level = sorted(path.name + ("/" if path.is_dir() else "") for path in bundle.iterdir())
    assert top_level == sorted(PRD_18_4_LAYOUT)


def test_a_null_bundle_path_is_accepted(bundle_factory, trusted_keys) -> None:
    """The default case: the artefact is delivered to the host by configured local path."""
    document = read_manifest(bundle_factory())
    assert all(pin["bundle_path"] is None for pin in document["local_models"])
    assert verify_bundle(bundle_factory(), public_keys=trusted_keys).ok


def test_a_string_bundle_path_is_also_expressible(bundle_factory) -> None:
    """The manifest can express the other outcome; this ticket does not choose it."""
    pin = replace(document_pin(), bundle_path="models/document-embedding.onnx")
    document = read_manifest(bundle_factory(local_models=(pin,)))
    documents = schema_documents(1)
    validator = Draft202012Validator(documents[RELEASE_SCHEMA_ID], documents=documents)
    assert list(validator.iter_errors(document)) == []


def test_no_model_weight_file_is_added_to_the_bundle(bundle_factory) -> None:
    document = read_manifest(bundle_factory())
    listed = {entry["path"] for entry in document["files"]}
    assert listed == {
        "corpus.sqlite",
        "embedding-manifest.json",
        "tantivy/meta.json",
        "vectors.usearch",
    }
