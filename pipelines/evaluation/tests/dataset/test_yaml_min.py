"""`yaml_min` reads exactly the subset it documents, and refuses everything else out loud."""

from __future__ import annotations

import json
from pathlib import Path

import dataset_fixtures  # noqa: F401  (puts `pipelines/evaluation/src` on sys.path)
import pytest
from dataset import yaml_min
from dataset.paths import SPLITS_DIR


def test_block_mapping_and_sequence() -> None:
    document = yaml_min.load(
        "\n".join(
            [
                "---",
                "# a comment",
                "name: federal",
                "code: FED",
                "counts:",
                "  development: 48",
                "  validation: 16",
                "empty_list: []",
                "empty_map: {}",
                "tags:",
                "  - alpha",
                "  - beta",
                "nested:",
                "  - key: one",
                "    other: 2",
                "  - key: three",
                "    other: 4",
            ]
        )
    )
    assert document == {
        "name": "federal",
        "code": "FED",
        "counts": {"development": 48, "validation": 16},
        "empty_list": [],
        "empty_map": {},
        "tags": ["alpha", "beta"],
        "nested": [{"key": "one", "other": 2}, {"key": "three", "other": 4}],
    }


def test_sequence_may_sit_at_the_key_column() -> None:
    assert yaml_min.load("tags:\n- a\n- b\n") == {"tags": ["a", "b"]}


def test_scalars() -> None:
    document = yaml_min.load(
        "\n".join(
            [
                "yes_flag: true",
                "no_flag: false",
                "nothing: null",
                "tilde: ~",
                "count: -12",
                "ratio: 0.5",
                "quoted: 'a: b'",
                "escaped: \"line\\nbreak\"",
                "date: 2026-08-19",
                "trailing: value  # comment",
                "hash_inside: a#b",
            ]
        )
    )
    assert document["yes_flag"] is True
    assert document["no_flag"] is False
    assert document["nothing"] is None
    assert document["tilde"] is None
    assert document["count"] == -12
    assert document["ratio"] == 0.5
    assert document["quoted"] == "a: b"
    assert document["escaped"] == "line\nbreak"
    assert document["trailing"] == "value"
    assert document["hash_inside"] == "a#b"


def test_a_calendar_date_stays_a_string() -> None:
    """PRD §35.1 dates travel as strings; a `date` object would not survive JSON round-tripping."""
    document = yaml_min.load("legal_as_at: 2026-08-19\n")
    assert document["legal_as_at"] == "2026-08-19"
    assert json.loads(json.dumps(document)) == document


def test_literal_block_scalar() -> None:
    document = yaml_min.load("body: |\n  first\n  second\n")
    assert document["body"] == "first\nsecond\n"


def test_literal_block_scalar_strip_indicator() -> None:
    assert yaml_min.load("body: |-\n  first\n  second\n")["body"] == "first\nsecond"


def test_folded_block_scalar() -> None:
    document = yaml_min.load("body: >-\n  first\n  second\n\n  third\n")
    assert document["body"] == "first second\nthird"


@pytest.mark.parametrize(
    ("text", "why"),
    [
        ("anchor: &a value\n", "anchors"),
        ("alias: *a\n", "aliases"),
        ("tagged: !!str 5\n", "tags"),
        ("flow: [1, 2]\n", "non-empty flow sequence"),
        ("flow: {a: 1}\n", "non-empty flow mapping"),
        ("a: 1\n---\nb: 2\n", "a second document"),
        ("a: 1\n...\n", "a document end marker"),
        ("root:\n\tchild: 1\n", "a tab in indentation"),
    ],
)
def test_unsupported_constructs_raise(text: str, why: str) -> None:
    with pytest.raises(yaml_min.UnsupportedYamlError):
        yaml_min.load(text)
    assert why  # the parametrise label documents the construct under test


def test_duplicate_key_is_an_error() -> None:
    with pytest.raises(yaml_min.YamlError):
        yaml_min.load("a: 1\na: 2\n")


def test_oversized_document_is_refused() -> None:
    with pytest.raises(yaml_min.UnsupportedYamlError):
        yaml_min.load("a: " + "x" * (yaml_min.MAX_BYTES + 1) + "\n")


def test_deep_nesting_is_refused() -> None:
    text = "".join(f"{' ' * (2 * depth)}k{depth}:\n" for depth in range(yaml_min.MAX_DEPTH + 4))
    text += " " * (2 * (yaml_min.MAX_DEPTH + 4)) + "leaf: 1\n"
    with pytest.raises(yaml_min.UnsupportedYamlError):
        yaml_min.load(text)


@pytest.mark.parametrize(
    "value",
    [
        {"a": 1, "b": "text", "c": None, "d": True, "e": [], "f": {}},
        {"rows": [{"slug": "federal", "code": "FED", "development": 48}]},
        {"nested": {"deep": {"deeper": ["x", "y"]}}},
        {"date": "2026-08-19", "quoted": "a: b", "empty": ""},
        [1, 2, 3],
    ],
)
def test_dump_round_trips(value: object) -> None:
    assert yaml_min.load(yaml_min.dump(value)) == value


def test_repository_yaml_files_load(tmp_path: Path) -> None:
    """Every YAML file this ticket commits parses, and round-trips through `dump`."""
    del tmp_path
    files = sorted(SPLITS_DIR.glob("*.yaml"))
    assert files, "evals/splits must hold the frozen YAML data this ticket owns"
    for path in files:
        document = yaml_min.load_path(path)
        assert yaml_min.load(yaml_min.dump(document)) == document


def test_agrees_with_pyyaml_when_it_is_installed() -> None:
    """Cross-engine agreement, when a real YAML engine happens to be importable."""
    yaml = pytest.importorskip("yaml")
    for path in sorted(SPLITS_DIR.glob("*.yaml")):
        text = path.read_text(encoding="utf-8")
        assert yaml_min.load(text) == yaml.safe_load(text), path.name
