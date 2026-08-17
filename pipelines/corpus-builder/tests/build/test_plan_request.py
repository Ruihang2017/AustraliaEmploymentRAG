"""`BuildRequest` shape validation, and the rule that a pin defect is never an exception."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from candidate_paths import SRC  # noqa: F401  (imported for its sys.path side effect)

from build import BuildRequest, InvalidBuildRequest, load_model_pins, load_runtime_pin
from manifest import CompatibilityRange, CompatibilityRanges, Versions
from validation import AnomalyThresholds


def _versions() -> Versions:
    return Versions(
        schema="1.0.0",
        parser="1.0.0",
        chunker="1.0.0",
        embedding="1.0.0",
        index="1.0.0",
        builder="0.0.0",
        contract="1.0.0",
    )


def _compatibility() -> CompatibilityRanges:
    return CompatibilityRanges(
        app=CompatibilityRange(min="0.1.0", max=None),
        search=CompatibilityRange(min="0.1.0", max=None),
        corpus_schema="1.0.0",
    )


def _request(**overrides: object) -> BuildRequest:
    base: dict[str, object] = {
        "corpus_db_path": Path("corpus.sqlite"),
        "embedding_dir": Path("embeddings"),
        "output_dir": Path("out"),
        "release_id": "rel-0001",
        "versions": _versions(),
        "compatibility": _compatibility(),
        "local_model_pins": (),
        "runtime_pin": None,
        "embedding_profile_id": "profile",
        "chunk_profile_id": "chunk-profile",
        "public_key_paths": (),
    }
    base.update(overrides)
    return BuildRequest(**base)  # type: ignore[arg-type]


def test_release_kind_must_be_known() -> None:
    with pytest.raises(InvalidBuildRequest):
        _request(release_kind="PROMOTED")


def test_release_id_is_never_defaulted() -> None:
    with pytest.raises(InvalidBuildRequest):
        _request(release_id="")


@pytest.mark.parametrize(
    "release_id",
    [
        "../../../../evil",
        "..",
        "../sibling",
        "..\\sibling",
        "a/b",
        "a\\b",
        "C:evil",
        "/absolute",
        ".hidden",
        "rel 0001",
        "rel-0001/",
        "rel\x00-0001",
        "rel-0001\n",
        "-leading-dash",
        "trailing-dot.",
        "x" * 200,
    ],
)
def test_release_id_may_not_escape_the_output_directory(release_id: str) -> None:
    """REGRESSION (reviewer, CRITICAL). `release_id` is joined onto `output_dir` to form BOTH the
    final bundle path and the staging path that a rejected build `rmtree`s, so a traversing id could
    write a release outside `--out` or delete a directory the operator never named."""
    with pytest.raises(InvalidBuildRequest):
        _request(release_id=release_id)


@pytest.mark.parametrize("release_id", ["rel-0001", "cr_0199abcd", "20260817T101112Z", "a", "1.2.3"])
def test_release_id_accepts_the_shapes_this_repository_uses(release_id: str) -> None:
    request = _request(release_id=release_id)
    assert request.bundle_name == f"corpus-release-{release_id}"


def test_traversing_release_id_would_have_escaped_before_the_pattern_existed(
    tmp_path: Path,
) -> None:
    """The concrete exploit the reviewer reproduced, asserted as an exploit rather than as a regex.

    `Path(out) / 'corpus-release-../../../../evil'` resolves far outside `out`; the request must
    refuse it, and the containment assertion must agree that the accepted ids stay inside.
    """
    escaped = (tmp_path / "out" / "corpus-release-../../../../evil").resolve()
    root = (tmp_path / "out").resolve()
    assert root not in escaped.parents  # the traversal is real, not hypothetical

    with pytest.raises(InvalidBuildRequest):
        _request(output_dir=tmp_path / "out", release_id="../../../../evil")

    safe = _request(output_dir=tmp_path / "out", release_id="rel-0001")
    assert root in safe.final_dir.resolve().parents
    assert root in safe.staging_dir.resolve().parents


def test_absent_pins_are_not_an_exception() -> None:
    """A CANDIDATE with no pins at all is constructible: it is a GATE rejection, not a TypeError.

    The acceptance checklist requires such a build to produce `decision: REJECTED` with a dedicated
    blocking code, which is only reachable if the request itself can be built.
    """
    request = _request(release_kind="CANDIDATE", local_model_pins=(), runtime_pin=None)
    assert request.local_model_pins == ()
    assert request.runtime_pin is None


def test_parent_id_and_parent_database_must_agree() -> None:
    with pytest.raises(InvalidBuildRequest):
        _request(parent_release_id="rel-0000")
    with pytest.raises(InvalidBuildRequest):
        _request(parent_corpus_db_path=Path("parent.sqlite"))
    request = _request(parent_release_id="rel-0000", parent_corpus_db_path=Path("parent.sqlite"))
    assert request.parent_release_id == "rel-0000"


def test_signing_key_path_and_id_must_agree() -> None:
    with pytest.raises(InvalidBuildRequest):
        _request(signing_key_path=Path("key.json"))
    with pytest.raises(InvalidBuildRequest):
        _request(signing_key_id="dev-key")


def test_derived_paths() -> None:
    request = _request(output_dir=Path("out"), release_id="rel-42")
    assert request.bundle_name == "corpus-release-rel-42"
    assert request.final_dir == Path("out") / "corpus-release-rel-42"
    assert request.staging_dir == Path("out") / ".staging" / "rel-42"
    assert request.staging_dir != request.final_dir


def test_thresholds_reject_a_non_percentage_override() -> None:
    with pytest.raises(ValueError):
        AnomalyThresholds(by_source_group={"LEG-CTH": {"duplicate_stable_identity": 0.5}})
    with pytest.raises(ValueError):
        AnomalyThresholds(collection_count_change_fraction=10)


def test_thresholds_resolve_per_source_group() -> None:
    thresholds = AnomalyThresholds(by_source_group={"LEG-CTH": {"parse_failure_rate": 0.01}})
    assert thresholds.for_group("LEG-CTH") == (0.10, 0.01)
    assert thresholds.for_group("LEG-NSW") == (0.10, 0.02)


def test_pins_are_loaded_from_files_the_caller_names(tmp_path: Path) -> None:
    runtime = {
        "family": "onnxruntime",
        "version": "1.2.3",
        "execution_providers": ["CPU"],
        "integration": {"crate": "ort", "version": "2.0.0"},
        "tokenizer_library": {"crate": "tokenizers", "version": "0.20.0"},
        "pinned_by": "RETR-07-record",
    }
    runtime_path = tmp_path / "runtime.json"
    runtime_path.write_text(json.dumps(runtime), encoding="utf-8")
    assert load_runtime_pin(runtime_path).family == "onnxruntime"

    pin = {
        "role": "DOCUMENT_EMBEDDING",
        "model_id": "vendor/model",
        "model_revision": "rev-1",
        "model_artifact": {"sha256": "a" * 64, "byte_size": 1, "format": "onnx"},
        "dimensions": 8,
        "normalisation": "L2",
        "truncation": "RIGHT",
        "max_tokens": 512,
        "tokenizer": {
            "id": "tok",
            "artifact_sha256": "b" * 64,
            "max_tokens": 512,
            "truncation": "RIGHT",
        },
        "licence": {
            "identifier": "MIT",
            "url": None,
            "attribution_required": False,
            "redistribution_permitted": True,
            "notes": None,
        },
        "bundle_path": None,
    }
    pins_path = tmp_path / "pins.json"
    pins_path.write_text(json.dumps([pin]), encoding="utf-8")
    loaded = load_model_pins(pins_path)
    assert len(loaded) == 1 and loaded[0].role == "DOCUMENT_EMBEDDING"


def test_unreadable_pin_file_is_a_request_defect(tmp_path: Path) -> None:
    with pytest.raises(InvalidBuildRequest):
        load_runtime_pin(tmp_path / "absent.json")
