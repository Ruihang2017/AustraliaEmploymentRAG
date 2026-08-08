"""A source module can conform to the INR contract WITHOUT importing corpus-builder code.

This is breakdown plan A4 made mechanical, and CRPS-01 test plan step 3. The validation below uses
only `json`, `pathlib` and a generic JSON-Schema library; it never imports `contracts`,
`taxrag_pipeline_corpus_builder` or anything else from `pipelines/corpus-builder/src`, and it does
not use the `sys.path` entry the sibling `conftest.py` installs — the schema directory is located by
relative path from this file.

`sys` and `subprocess` appear for ONE purpose: the independence assertion runs in a FRESH
interpreter. Asserting on this process's `sys.modules` would be vacuous in a full-suite run, where a
sibling test module has already imported the builder — a child process is the only honest proof.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

HERE = Path(__file__).resolve().parent
SCHEMA_DIR = HERE.parents[1] / "schema" / "intermediate" / "v1"
VALID_RUN = HERE / "fixtures" / "valid" / "run-001"


def build_validator() -> Draft202012Validator:
    """Exactly what a source-module author writes after reading `schema/intermediate/v1/README.md`."""
    registry = Registry()
    for path in sorted(SCHEMA_DIR.glob("*.schema.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        registry = registry.with_resource(document["$id"], Resource.from_contents(document))
    envelope = json.loads((SCHEMA_DIR / "envelope.schema.json").read_text(encoding="utf-8"))
    return Draft202012Validator(envelope, registry=registry)


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
    errors = sorted(build_validator().iter_errors(record), key=lambda error: list(error.path))
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


INDEPENDENCE_PROBE = r"""
import json, sys
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

schema_dir = Path(sys.argv[1])
run_dir = Path(sys.argv[2])
registry = Registry()
for path in sorted(schema_dir.glob("*.schema.json")):
    document = json.loads(path.read_text(encoding="utf-8"))
    registry = registry.with_resource(document["$id"], Resource.from_contents(document))
envelope = json.loads((schema_dir / "envelope.schema.json").read_text(encoding="utf-8"))
validator = Draft202012Validator(envelope, registry=registry)

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
print(json.dumps({"count": count, "leaked": leaked}))
"""


def test_validation_needs_no_corpus_builder_import_at_all() -> None:
    result = subprocess.run(
        [sys.executable, "-c", INDEPENDENCE_PROBE, str(SCHEMA_DIR), str(VALID_RUN)],
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
    assert report["count"] == len(valid_records())
