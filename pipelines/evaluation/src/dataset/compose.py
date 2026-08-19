"""Compose the dataset from the directory tree — sub-PRD D4: splits are composed, never listed.

There is no central index anywhere in this package: `compose()` discovers `<root>/cases/<slug>/`,
reads what is there and returns one in-memory `Dataset`. Adding a category is adding a directory.
That is not a convenience — a central list of the 600 case ids under `evals/splits/**` would put
ten concurrently-running authoring tickets (`GOLD-05` … `GOLD-14`) on one file, and
`tests/dataset/test_allocation_frozen.py::test_splits_hold_no_case_id` asserts no such list exists.

DIRECTORY CONTRACT, which `GOLD-05` … `GOLD-14` write against:

    <root>/cases/<slug>/stratification.yaml           the category's declared coverage contract
    <root>/cases/<slug>/<EVAL-XXX-NNN>.yaml           one DEVELOPMENT or VALIDATION case
    <root>/cases/<slug>/blind/<id>.sidecar.yaml       a BLIND case's allowlisted metadata
    <root>/cases/<slug>/blind/<id>.envelope.json      that case's sealed ciphertext

A BLIND case has NO case file: its content exists in the repository only as ciphertext (sub-PRD
D1). A parse failure is captured as data on the `Category` rather than raised, so `SCHEMA_VALID`
can report it as a finding — a checker that crashed on the first malformed file would tell an
author nothing about the other 599.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import yaml_min
from .model import (
    BlindSidecar,
    Category,
    Dataset,
    DatasetVersion,
    Migration,
    SealedEnvelope,
    Stratification,
    load_allocation,
)
from .paths import EVALS_DIR

__all__ = [
    "BLIND_DIRNAME",
    "ENVELOPE_SUFFIX",
    "SIDECAR_SUFFIX",
    "compose",
]

BLIND_DIRNAME = "blind"
SIDECAR_SUFFIX = ".sidecar.yaml"
ENVELOPE_SUFFIX = ".envelope.json"
_STRATIFICATION = "stratification.yaml"


def compose(root: Path | str | None = None) -> Dataset:
    """Discover and load everything under *root* (an `evals`-shaped directory)."""
    base = Path(root) if root is not None else EVALS_DIR
    splits_dir = base / "splits"
    cases_dir = base / "cases"
    categories: list[Category] = []
    if cases_dir.is_dir():
        for entry in sorted(cases_dir.iterdir()):
            if entry.is_dir() and not entry.name.startswith("."):
                categories.append(_compose_category(entry))
    return Dataset(
        root=base,
        categories=tuple(categories),
        allocation=load_allocation(splits_dir) if (splits_dir / "allocation.yaml").is_file() else (),
        versions=_load_versions(splits_dir / "dataset-versions"),
        migrations=_load_migrations(splits_dir / "migrations"),
        id_rules=_load_optional_yaml(splits_dir / "id-rules.yaml") or {},
    )


def _compose_category(directory: Path) -> Category:
    cases = []
    sidecars = []
    unparseable: list[tuple[Path, str]] = []
    stratification: Stratification | None = None

    strat_path = directory / _STRATIFICATION
    if strat_path.is_file():
        document, error = _read_yaml(strat_path)
        if error is not None:
            unparseable.append((strat_path, error))
        elif isinstance(document, dict):
            stratification = Stratification(
                category=document.get("category", directory.name),
                code=document.get("code", ""),
                path=strat_path,
                raw=document,
            )

    for path in sorted(directory.glob("*.yaml")):
        if path.name == _STRATIFICATION:
            continue
        document, error = _read_yaml(path)
        if error is not None:
            unparseable.append((path, error))
            continue
        if not isinstance(document, dict):
            unparseable.append((path, "the case file is not a mapping"))
            continue
        cases.append(
            _case(document, path, directory.name)
        )

    blind_dir = directory / BLIND_DIRNAME
    if blind_dir.is_dir():
        envelopes = _load_envelopes(blind_dir, unparseable)
        for path in sorted(blind_dir.glob(f"*{SIDECAR_SUFFIX}")):
            document, error = _read_yaml(path)
            if error is not None:
                unparseable.append((path, error))
                continue
            if not isinstance(document, dict):
                unparseable.append((path, "the sidecar is not a mapping"))
                continue
            case_id = document.get("id", path.name[: -len(SIDECAR_SUFFIX)])
            sidecars.append(
                BlindSidecar(
                    id=case_id if isinstance(case_id, str) else "",
                    primary_category=document.get("primary_category", directory.name),
                    envelope_digest=document.get("envelope_digest", ""),
                    path=path,
                    raw=document,
                    envelope=envelopes.get(case_id),
                )
            )

    return Category(
        slug=directory.name,
        path=directory,
        cases=tuple(cases),
        sidecars=tuple(sidecars),
        stratification=stratification,
        unparseable=tuple(unparseable),
    )


def _case(document: dict, path: Path, slug: str):
    from .model import Case

    identifier = document.get("id")
    return Case(
        id=identifier if isinstance(identifier, str) else "",
        split=document.get("split", "") if isinstance(document.get("split"), str) else "",
        primary_category=document.get("primary_category", slug)
        if isinstance(document.get("primary_category"), str)
        else slug,
        path=path,
        raw=document,
    )


def _load_envelopes(
    blind_dir: Path, unparseable: list[tuple[Path, str]]
) -> dict[str, SealedEnvelope]:
    envelopes: dict[str, SealedEnvelope] = {}
    for path in sorted(blind_dir.glob(f"*{ENVELOPE_SUFFIX}")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            unparseable.append((path, type(error).__name__))
            continue
        if not isinstance(document, dict):
            unparseable.append((path, "the envelope is not a JSON object"))
            continue
        envelope = SealedEnvelope.from_mapping(document, path)
        key = envelope.case_id or path.name[: -len(ENVELOPE_SUFFIX)]
        envelopes[key] = envelope
    return envelopes


def _load_versions(directory: Path) -> tuple[DatasetVersion, ...]:
    if not directory.is_dir():
        return ()
    versions: list[DatasetVersion] = []
    for path in sorted(directory.glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(document, dict) or "version" not in document:
            continue
        versions.append(
            DatasetVersion(
                version=document["version"],
                created_at=document.get("created_at", ""),
                approved_by=document.get("approved_by", ""),
                reason=document.get("reason", ""),
                path=path,
                raw=document,
            )
        )
    return tuple(versions)


def _load_migrations(directory: Path) -> tuple[Migration, ...]:
    if not directory.is_dir():
        return ()
    migrations: list[Migration] = []
    for path in sorted(directory.glob("*.json")):
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(document, dict):
            continue
        migrations.append(
            Migration(
                from_version=document.get("from_version", ""),
                to_version=document.get("to_version", ""),
                classification=document.get("classification", ""),
                path=path,
                raw=document,
            )
        )
    return tuple(migrations)


def _read_yaml(path: Path) -> tuple[object | None, str | None]:
    try:
        return yaml_min.load_path(path), None
    except yaml_min.YamlError as error:
        return None, str(error)
    except OSError as error:
        return None, type(error).__name__


def _load_optional_yaml(path: Path) -> object | None:
    if not path.is_file():
        return None
    document, _error = _read_yaml(path)
    return document
