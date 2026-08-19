"""Typed, frozen records for everything the dataset is made of.

`Split` and `PrimaryCategory` are GENERATED from `evals/splits/allocation.yaml` rather than typed
out: a second copy of the PRD §43.1 category list would drift from the frozen data the moment one
side was edited, and drift is exactly what `ALLOCATION_EXACT` exists to make impossible.

CONTENT HASHING. `content_sha256` is taken over the record's CANONICAL JSON form — sorted keys, no
insignificant whitespace, UTF-8 — and never over file bytes. `core.autocrlf` is true on the
maintainer's platform, so a case file's bytes differ between a Windows and a Linux checkout while
its data does not; hashing bytes would make the sub-PRD D8 version registry non-reproducible across
platforms and would fail `VERSIONED_CORRECTIONS` for a checkout, not for a correction. The sealed
ciphertext is hashed as bytes, because no checkout ever rewrites base64-decoded ciphertext.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Mapping

from . import yaml_min
from .paths import SPLITS_DIR

__all__ = [
    "EXPECTED_OUTPUT_FIELDS",
    "BlindSidecar",
    "Case",
    "CategoryAllocation",
    "Dataset",
    "DatasetVersion",
    "GoldAuthority",
    "Migration",
    "PrimaryCategory",
    "SealedEnvelope",
    "Split",
    "Stratification",
    "canonical_bytes",
    "content_sha256",
    "load_allocation",
]

#: The members PRD §43.4 calls the case's EXPECTED OUTPUT. A change to any of them additionally
#: requires a migration record, which is why they are hashed apart from the rest of the case.
EXPECTED_OUTPUT_FIELDS: tuple[str, ...] = (
    "expected_answer_status",
    "acceptable_statuses",
    "gold_authorities",
    "required_claims",
    "optional_claims",
    "prohibited_claims",
    "expected_clarifications",
    "expected_refusal_reason",
)


def canonical_bytes(value: Any) -> bytes:
    """The canonical JSON encoding used for every content digest in this package."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def content_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


# -- generated vocabulary ----------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CategoryAllocation:
    """One row of the PRD §43.1 table."""

    slug: str
    code: str
    ticket: str
    title: str
    development: int
    validation: int
    blind: int
    total: int

    def count_for(self, split: "Split") -> int:
        return {
            Split.DEVELOPMENT: self.development,
            Split.VALIDATION: self.validation,
            Split.BLIND: self.blind,
        }[split]


def load_allocation(splits_dir: Path | None = None) -> tuple[CategoryAllocation, ...]:
    """Read `allocation.yaml`. The single source of the category vocabulary and the counts."""
    document = yaml_min.load_path((splits_dir or SPLITS_DIR) / "allocation.yaml")
    return tuple(
        CategoryAllocation(
            slug=row["slug"],
            code=row["code"],
            ticket=row["ticket"],
            title=row["title"],
            development=row["development"],
            validation=row["validation"],
            blind=row["blind"],
            total=row["total"],
        )
        for row in document["categories"]
    )


class Split(str, Enum):
    """PRD §14.1's three splits. This dataset's own vocabulary, not a canonical FND-03 family."""

    DEVELOPMENT = "DEVELOPMENT"
    VALIDATION = "VALIDATION"
    BLIND = "BLIND"


#: Generated from `allocation.yaml` at import time — never typed out a second time.
PrimaryCategory = Enum(  # type: ignore[misc]
    "PrimaryCategory",
    {row.slug.replace("-", "_").upper(): row.slug for row in load_allocation()},
    type=str,
)
PrimaryCategory.__doc__ = (
    "The ten PRD §43.1 category directory slugs, generated from evals/splits/allocation.yaml."
)


# -- records ------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class GoldAuthority:
    """One immutable corpus citation (PRD §43.2, §15.3)."""

    document_id: str
    version_id: str
    node_id: str
    citation_role: str
    required: bool
    quote_start: int | None = None
    quote_end: int | None = None

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> "GoldAuthority":
        return cls(
            document_id=raw.get("document_id", ""),
            version_id=raw.get("version_id", ""),
            node_id=raw.get("node_id", ""),
            citation_role=raw.get("citation_role", ""),
            required=bool(raw.get("required", False)),
            quote_start=raw.get("quote_start"),
            quote_end=raw.get("quote_end"),
        )


@dataclass(frozen=True, slots=True)
class Case:
    """A visible (DEVELOPMENT or VALIDATION) case, as composed from its file.

    `raw` is the parsed document exactly as authored, so schema validation and hashing see what the
    author wrote rather than what this dataclass chose to keep.
    """

    id: str
    split: str
    primary_category: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)

    @property
    def gold_authorities(self) -> tuple[GoldAuthority, ...]:
        entries = self.raw.get("gold_authorities")
        if not isinstance(entries, list):
            return ()
        return tuple(
            GoldAuthority.from_mapping(entry) for entry in entries if isinstance(entry, Mapping)
        )

    def content_sha256(self) -> str:
        return content_sha256(self.raw)

    def expected_output_sha256(self) -> str:
        return content_sha256({name: self.raw.get(name) for name in EXPECTED_OUTPUT_FIELDS})


@dataclass(frozen=True, slots=True)
class SealedEnvelope:
    """The on-disk descriptor of a sealed BLIND case (`blind-envelope.schema.json`)."""

    case_id: str
    algorithm: str
    recipient_key_id: str
    blind_dataset_major_version: int
    ciphertext_sha256: str
    byte_length: int
    sealed_at: str
    sealer: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any], path: Path) -> "SealedEnvelope":
        return cls(
            case_id=raw.get("case_id", ""),
            algorithm=raw.get("algorithm", ""),
            recipient_key_id=raw.get("recipient_key_id", ""),
            blind_dataset_major_version=raw.get("blind_dataset_major_version", 0),
            ciphertext_sha256=raw.get("ciphertext_sha256", ""),
            byte_length=raw.get("byte_length", 0),
            sealed_at=raw.get("sealed_at", ""),
            sealer=raw.get("sealer", ""),
            path=path,
            raw=raw,
        )


@dataclass(frozen=True, slots=True)
class BlindSidecar:
    """The allowlisted, content-free metadata of a BLIND case (sub-PRD D3)."""

    id: str
    primary_category: str
    envelope_digest: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)
    envelope: SealedEnvelope | None = None

    @property
    def split(self) -> str:
        return "BLIND"

    def content_sha256(self) -> str:
        return content_sha256(self.raw)


@dataclass(frozen=True, slots=True)
class Stratification:
    """A category's declared coverage contract (`stratification.schema.json`)."""

    category: str
    code: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)

    def floors(self, name: str) -> tuple[tuple[str, int], ...]:
        rows = self.raw.get(name)
        if not isinstance(rows, list):
            return ()
        return tuple(
            (row["key"], row["minimum"])
            for row in rows
            if isinstance(row, Mapping) and "key" in row and "minimum" in row
        )


@dataclass(frozen=True, slots=True)
class DatasetVersion:
    """One sub-PRD D8 version registry instance."""

    version: str
    created_at: str
    approved_by: str
    reason: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)

    def rows(self) -> dict[str, Mapping[str, Any]]:
        entries = self.raw.get("cases")
        if not isinstance(entries, list):
            return {}
        return {row["id"]: row for row in entries if isinstance(row, Mapping) and "id" in row}


@dataclass(frozen=True, slots=True)
class Migration:
    """One sub-PRD D8 migration record (`dataset-migration.schema.json`)."""

    from_version: str
    to_version: str
    classification: str
    path: Path
    raw: Mapping[str, Any] = field(repr=False)

    def case_ids(self) -> frozenset[str]:
        entries = self.raw.get("mappings")
        if not isinstance(entries, list):
            return frozenset()
        return frozenset(
            row["case_id"] for row in entries if isinstance(row, Mapping) and "case_id" in row
        )


@dataclass(frozen=True, slots=True)
class Category:
    """One `evals/cases/<slug>/` directory, as found on disk."""

    slug: str
    path: Path
    cases: tuple[Case, ...]
    sidecars: tuple[BlindSidecar, ...]
    stratification: Stratification | None
    unparseable: tuple[tuple[Path, str], ...] = ()

    def case_ids(self) -> tuple[str, ...]:
        return tuple(case.id for case in self.cases) + tuple(side.id for side in self.sidecars)


@dataclass(frozen=True, slots=True)
class Dataset:
    """Everything `compose()` found, in one in-memory value. No central index is ever read."""

    root: Path
    categories: tuple[Category, ...]
    allocation: tuple[CategoryAllocation, ...]
    versions: tuple[DatasetVersion, ...]
    migrations: tuple[Migration, ...]
    id_rules: Mapping[str, Any] = field(repr=False, default_factory=dict)

    def category(self, slug: str) -> Category | None:
        for entry in self.categories:
            if entry.slug == slug:
                return entry
        return None

    def allocation_for(self, slug: str) -> CategoryAllocation | None:
        for row in self.allocation:
            if row.slug == slug:
                return row
        return None

    def latest_version(self) -> DatasetVersion | None:
        if not self.versions:
            return None
        return max(self.versions, key=lambda version: int(version.version.lstrip("v")))
