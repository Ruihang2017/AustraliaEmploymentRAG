"""`evals/splits/allocation.yaml` IS the PRD §43.1 table — asserted row for row.

Acceptance item: "The §43.1 table is frozen data: `evals/splits/allocation.yaml` equals
`prd-43-1-allocation.json` row for row, and the totals are exactly 360 / 120 / 120 / 600."
"""

from __future__ import annotations

import json

import dataset_fixtures
from dataset import yaml_min
from dataset.paths import SPLITS_DIR

_TRANSCRIPTION = json.loads(
    (dataset_fixtures.DATA_DIR / "prd-43-1-allocation.json").read_text(encoding="utf-8")
)
_ALLOCATION = yaml_min.load_path(SPLITS_DIR / "allocation.yaml")


def test_row_for_row() -> None:
    rows = _TRANSCRIPTION["rows"]
    categories = _ALLOCATION["categories"]
    assert len(categories) == len(rows) == 10
    for expected, actual in zip(rows, categories, strict=True):
        assert actual["ticket"] == expected["ticket"]
        assert actual["slug"] == expected["slug"]
        assert actual["code"] == expected["code"]
        for split in ("development", "validation", "blind", "total"):
            assert actual[split] == expected[split], (actual["slug"], split)


def test_each_row_total_is_the_sum_of_its_splits() -> None:
    for row in _ALLOCATION["categories"]:
        assert row["development"] + row["validation"] + row["blind"] == row["total"], row["slug"]


def test_totals_are_360_120_120_600() -> None:
    assert _ALLOCATION["totals"] == {
        "development": 360,
        "validation": 120,
        "blind": 120,
        "total": 600,
    }
    assert _ALLOCATION["totals"] == _TRANSCRIPTION["totals"]


def test_totals_are_the_column_sums() -> None:
    for split in ("development", "validation", "blind", "total"):
        assert sum(row[split] for row in _ALLOCATION["categories"]) == _ALLOCATION["totals"][split]


def test_codes_and_slugs_are_unique() -> None:
    codes = [row["code"] for row in _ALLOCATION["categories"]]
    slugs = [row["slug"] for row in _ALLOCATION["categories"]]
    assert len(set(codes)) == len(codes)
    assert len(set(slugs)) == len(slugs)


def test_id_rules_codes_match_the_allocation() -> None:
    id_rules = yaml_min.load_path(SPLITS_DIR / "id-rules.yaml")
    assert id_rules["codes"] == [row["code"] for row in _ALLOCATION["categories"]]


def test_splits_hold_no_case_id() -> None:
    """Sub-PRD D4: splits are composed, never centrally listed.

    A central index under `evals/splits/**` would put ten authoring tickets on one file, and is
    the thing the ticket's Reviewer-focus item asks to be confirmed absent.
    """
    needles = tuple(f"EVAL-{row['code']}-" for row in _TRANSCRIPTION["rows"])

    def walk(value: object, path: object) -> None:
        if isinstance(value, dict):
            for key, item in value.items():
                walk(key, path)
                walk(item, path)
        elif isinstance(value, list):
            for item in value:
                walk(item, path)
        elif isinstance(value, str):
            for needle in needles:
                assert needle not in value, f"{path} enumerates case ids ({needle})"

    for path in sorted(SPLITS_DIR.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix == ".yaml":
            walk(yaml_min.load_path(path), path)
        elif path.suffix in (".json", ".pub"):
            walk(json.loads(path.read_text(encoding="utf-8")), path)
