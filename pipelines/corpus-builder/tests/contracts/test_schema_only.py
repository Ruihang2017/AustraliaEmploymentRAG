"""A source module can conform to the INR contract WITHOUT importing corpus-builder code.

This is breakdown plan A4 made mechanical, and CRPS-01 test plan step 3. The validation below uses
only `json`, `pathlib` and a **generic** JSON-Schema validator; it never imports `contracts`,
`taxrag_pipeline_corpus_builder` or any other module from `pipelines/corpus-builder/src`, and it
does not use the `sys.path` entry the sibling `conftest.py` installs — the schema directory is
located by relative path from this file.

TWO ENGINES, ONE PROOF. When the third-party `jsonschema` library is importable the proof is the
strict one: nothing from this repository is loaded at all. When it is not — the state
`uv sync --frozen` leaves the repository in, because a `package = false` uv workspace member's
declared dependency is not installed into the root environment (E1 writeback) — the engine is
`jsonschema_min`, loaded **by file path** as a standalone module so the `contracts` package is still
never imported. `jsonschema_min` is a record-agnostic schema interpreter, and
`test_the_fallback_engine_is_generic` asserts that mechanically: if it ever learned the name of a
record type or a payload member it would stop being a substitute for an off-the-shelf library.

`sys` and `subprocess` appear for ONE purpose: the independence assertion runs in a FRESH
interpreter. Asserting on this process's `sys.modules` would be vacuous in a full-suite run, where a
sibling test module has already imported the builder — a child process is the only honest proof.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

HERE = Path(__file__).resolve().parent
SCHEMA_DIR = HERE.parents[1] / "schema" / "intermediate" / "v1"
VALID_RUN = HERE / "fixtures" / "valid" / "run-001"
FALLBACK_ENGINE = HERE.parents[1] / "src" / "contracts" / "jsonschema_min.py"

try:  # pragma: no cover — which branch runs depends on the environment, and both are supported.
    from jsonschema import Draft202012Validator as _Library  # type: ignore[import-not-found]
    from referencing import Registry, Resource  # type: ignore[import-not-found]

    ENGINE = "jsonschema"
except ImportError:  # pragma: no cover
    _Library = None  # type: ignore[assignment]
    ENGINE = "jsonschema_min"


def _load_fallback_engine() -> Any:
    """Import `jsonschema_min.py` BY PATH, so the `contracts` package is never imported."""
    spec = importlib.util.spec_from_file_location("jsonschema_min", FALLBACK_ENGINE)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_validator() -> Any:
    """Exactly what a source-module author writes after reading `schema/intermediate/v1/README.md`."""
    envelope = json.loads((SCHEMA_DIR / "envelope.schema.json").read_text(encoding="utf-8"))
    if ENGINE == "jsonschema":
        registry = Registry()
        for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
            document = json.loads(path.read_text(encoding="utf-8"))
            registry = registry.with_resource(document["$id"], Resource.from_contents(document))
        return _Library(envelope, registry=registry)
    engine = _load_fallback_engine()
    documents = engine.load_documents(sorted(SCHEMA_DIR.glob("*.schema.json")))
    return engine.Draft202012Validator(envelope, documents=documents)


def valid_records() -> list[tuple[str, int, dict]]:
    records: list[tuple[str, int, dict]] = []
    for path in sorted(VALID_RUN.glob("*.jsonl")):
        for index, line in enumerate(path.read_text(encoding="utf-8").splitlines()):
            records.append((path.name, index, json.loads(line)))
    return records


def test_the_fixture_run_is_present_and_covers_all_nine_record_types() -> None:
    envelope = json.loads((SCHEMA_DIR / "envelope.schema.json").read_text(encoding="utf-8"))
    declared = set(envelope["properties"]["record_type"]["enum"])
    assert len(declared) == 9
    present = {record["record_type"] for _, _, record in valid_records()}
    assert present == declared


@pytest.mark.parametrize(
    ("filename", "index", "record"),
    valid_records(),
    ids=lambda value: value if isinstance(value, str) else None,
)
def test_every_valid_fixture_validates_against_the_published_schemas(
    filename: str, index: int, record: dict
) -> None:
    errors = sorted(build_validator().iter_errors(record), key=lambda error: len(list(error.path)))
    assert not errors, f"{filename}[{index}]: " + "; ".join(
        f"{list(error.path)}: {error.message}" for error in errors
    )


def test_an_unknown_record_type_is_rejected_by_the_envelope_enum() -> None:
    record = dict(valid_records()[0][2])
    record["record_type"] = "invented_record_type"
    assert list(build_validator().iter_errors(record))


def test_a_corpus_primary_key_is_rejected_by_the_generic_validator() -> None:
    """Deliverable 11 has to hold for a source module using ANY validator, not only ours."""
    record = next(
        dict(item) for _, _, item in valid_records() if item["record_type"] == "document_node"
    )
    record["payload"] = dict(record["payload"])
    record["payload"]["stable_node_key"] = "nv_01930000-0000-7000-8000-00000000b001"
    assert list(build_validator().iter_errors(record))


def test_the_fallback_engine_is_generic() -> None:
    """The substitute for the third-party library must know nothing about THIS contract.

    A schema interpreter that had special cases for record types or payload members would make the
    A4 independence proof circular: it would be builder code wearing a validator's coat.
    """
    source = FALLBACK_ENGINE.read_text(encoding="utf-8")
    body = "\n".join(
        line for line in source.splitlines() if not line.lstrip().startswith("#")
    )
    envelope = json.loads((SCHEMA_DIR / "envelope.schema.json").read_text(encoding="utf-8"))
    contract_words = set(envelope["properties"]["record_type"]["enum"])
    for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        contract_words.update(document.get("properties", {}))
        for definition in document.get("$defs", {}).values():
            contract_words.update(definition.get("properties", {}))
    contract_words -= {"type", "items", "properties", "required", "pattern", "description"}
    leaked = sorted(word for word in contract_words if word in body)
    assert not leaked, f"jsonschema_min mentions contract vocabulary: {leaked}"


INDEPENDENCE_PROBE = r"""
import json, sys
from pathlib import Path

schema_dir = Path(sys.argv[1])
run_dir = Path(sys.argv[2])
engine_path = Path(sys.argv[3])

envelope = json.loads((schema_dir / "envelope.schema.json").read_text(encoding="utf-8"))
try:
    from jsonschema import Draft202012Validator
    from referencing import Registry, Resource

    registry = Registry()
    for path in sorted(schema_dir.glob("*.schema.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        registry = registry.with_resource(document["$id"], Resource.from_contents(document))
    validator = Draft202012Validator(envelope, registry=registry)
    engine = "jsonschema"
except ImportError:
    import importlib.util

    spec = importlib.util.spec_from_file_location("jsonschema_min", engine_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    documents = module.load_documents(sorted(schema_dir.glob("*.schema.json")))
    validator = module.Draft202012Validator(envelope, documents=documents)
    engine = "jsonschema_min"

count = 0
for path in sorted(run_dir.glob("*.jsonl")):
    for line in path.read_text(encoding="utf-8").splitlines():
        validator.validate(json.loads(line))
        count += 1

leaked = sorted(
    name
    for name in sys.modules
    if name == "contracts"
    or name.startswith("contracts.")
    or name.startswith("taxrag_pipeline_corpus_builder")
    or name.startswith("pipelines")
)
print(json.dumps({"count": count, "leaked": leaked, "engine": engine}))
"""


def test_validation_needs_no_corpus_builder_import_at_all() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            INDEPENDENCE_PROBE,
            str(SCHEMA_DIR),
            str(VALID_RUN),
            str(FALLBACK_ENGINE),
        ],
        capture_output=True,
        text=True,
        check=False,
        cwd=str(HERE.parents[3]),
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout.strip().splitlines()[-1])
    assert report["leaked"] == [], (
        "validating the conformance fixtures pulled in corpus-builder code: "
        f"{report['leaked']} — breakdown plan A4 requires the contract to stand alone"
    )
    assert "pipelines.corpus_builder" not in report["leaked"]
    assert report["count"] == len(valid_records())
    assert report["engine"] == ENGINE
