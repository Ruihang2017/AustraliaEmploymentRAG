"""NDJSON serialisation for intermediate normalised records (CRPS-01 deliverable 14).

The byte format is part of the contract, not an implementation detail: a byte-diff of two runs has
to be meaningful, so every file is UTF-8, LF-terminated, one record per line, object keys sorted,
no insignificant whitespace, non-ASCII written literally.

Two Windows-specific traps are closed here, because both would silently corrupt every hash:

* files are opened with `newline="\\n"`, since Python's default text mode translates `\\n` to
  `\\r\\n` on Windows;
* a `\\r\\n` line ending encountered on read is a hard error rather than being stripped — silently
  accepting it would make round-trip determinism untestable.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping

from .records import RECORD_TYPES, Envelope
from .validate import node_ref_key, validate_record
from .version import CONTRACT_VERSION
from .violations import ContractViolation

__all__ = [
    "MANIFEST_NAME",
    "RecordFileStat",
    "RunRecords",
    "encode_record",
    "read_records",
    "read_run",
    "write_records",
    "write_run",
]

MANIFEST_NAME = "records-manifest.json"


@dataclass(frozen=True, slots=True)
class RecordFileStat:
    """What one `<record_type>.jsonl` file contains, as the manifest records it."""

    record_type: str
    path: str
    sha256: str
    count: int

    def to_json(self) -> dict[str, Any]:
        return {
            "record_type": self.record_type,
            "path": self.path,
            "sha256": self.sha256,
            "count": self.count,
        }


@dataclass(frozen=True, slots=True)
class RunRecords:
    """One adapter run, read back and verified."""

    directory: Path
    contract_version: str
    files: tuple[RecordFileStat, ...]
    records: tuple[Envelope, ...]
    violations: tuple[ContractViolation, ...] = field(default=())

    @property
    def ok(self) -> bool:
        return not self.violations


def encode_record(obj: Mapping[str, Any]) -> str:
    """One NDJSON line, without its terminator."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _as_mapping(record: Envelope | Mapping[str, Any]) -> dict[str, Any]:
    return record.to_json() if isinstance(record, Envelope) else dict(record)


def write_records(
    path: str | os.PathLike[str],
    records: Iterable[Envelope | Mapping[str, Any]],
    *,
    record_type: str | None = None,
) -> RecordFileStat:
    """Write one `<record_type>.jsonl` file and return its hash and count.

    The hash is taken over the exact bytes written, so a caller can put it straight into the run
    manifest without re-reading the file.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    lines = [encode_record(_as_mapping(record)) for record in records]
    text = "".join(f"{line}\n" for line in lines)
    payload = text.encode("utf-8")
    with open(target, "wb") as handle:
        handle.write(payload)
    return RecordFileStat(
        record_type=record_type if record_type is not None else target.stem,
        path=target.name,
        sha256=hashlib.sha256(payload).hexdigest(),
        count=len(lines),
    )


def read_records(path: str | os.PathLike[str]) -> Iterator[Envelope]:
    """Yield every record in one `.jsonl` file, in file order.

    Reads bytes and decodes UTF-8 explicitly: the file's encoding is contract, not locale.
    """
    target = Path(path)
    raw = target.read_bytes()
    if b"\r\n" in raw:
        raise ValueError(
            f"{target} has CRLF line endings; the contract requires LF (CRPS-01 deliverable 14). "
            "This usually means the file was written in Python's default text mode on Windows, or "
            "checked out without the schema/ .gitattributes rule."
        )
    text = raw.decode("utf-8")
    if text and not text.endswith("\n"):
        raise ValueError(f"{target} does not end with a newline; every record line is terminated")
    for line in text.split("\n")[:-1]:
        yield Envelope.from_json(json.loads(line))


def write_run(
    directory: str | os.PathLike[str],
    records: Iterable[Envelope | Mapping[str, Any]],
    *,
    contract_version: str = CONTRACT_VERSION,
) -> tuple[RecordFileStat, ...]:
    """Write a whole run — one file per `record_type` plus `records-manifest.json`.

    Records keep their emission order within a type; types are grouped, never interleaved.
    """
    run_dir = Path(directory)
    run_dir.mkdir(parents=True, exist_ok=True)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        mapping = _as_mapping(record)
        grouped.setdefault(str(mapping.get("record_type")), []).append(mapping)

    stats = tuple(
        write_records(run_dir / f"{record_type}.jsonl", grouped[record_type], record_type=record_type)
        for record_type in sorted(grouped)
    )
    manifest = {
        "contract_version": contract_version,
        "files": [stat.to_json() for stat in stats],
    }
    with open(run_dir / MANIFEST_NAME, "wb") as handle:
        handle.write((json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8"))
    return stats


def read_run(directory: str | os.PathLike[str]) -> RunRecords:
    """Read and verify one run directory.

    Manifest hashes and counts are checked against the bytes on disk BEFORE any record is parsed, so
    a truncated or edited file is reported as such rather than as a schema failure. Records are then
    validated with the whole run in scope, which is what makes `OFFSET_OUT_OF_RANGE` checkable: a
    relation's evidence range is compared against the node version's actual `canonical_text`.
    """
    run_dir = Path(directory)
    manifest_path = run_dir / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    contract_version = str(manifest.get("contract_version", ""))

    stats: list[RecordFileStat] = []
    violations: list[ContractViolation] = []
    for entry in manifest.get("files", []):
        stat = RecordFileStat(
            record_type=str(entry["record_type"]),
            path=str(entry["path"]),
            sha256=str(entry["sha256"]),
            count=int(entry["count"]),
        )
        stats.append(stat)
        if "\\" in stat.path or Path(stat.path).is_absolute() or ".." in Path(stat.path).parts:
            violations.append(
                ContractViolation(
                    code="MANIFEST_HASH_MISMATCH",
                    message=f"manifest path {stat.path!r} must be POSIX and relative to the run dir",
                    pointer=f"/files/{stat.record_type}/path",
                )
            )
            continue
        blob = (run_dir / stat.path).read_bytes()
        actual = hashlib.sha256(blob).hexdigest()
        if actual != stat.sha256:
            violations.append(
                ContractViolation(
                    code="MANIFEST_HASH_MISMATCH",
                    message=f"{stat.path}: manifest says sha256 {stat.sha256}, file hashes to {actual}",
                    pointer=f"/files/{stat.record_type}/sha256",
                )
            )
        actual_count = blob.count(b"\n")
        if actual_count != stat.count:
            violations.append(
                ContractViolation(
                    code="MANIFEST_COUNT_MISMATCH",
                    message=f"{stat.path}: manifest says {stat.count} records, file holds {actual_count}",
                    pointer=f"/files/{stat.record_type}/count",
                )
            )

    if violations:
        return RunRecords(run_dir, contract_version, tuple(stats), (), tuple(violations))

    records: list[Envelope] = []
    for stat in stats:
        records.extend(read_records(run_dir / stat.path))

    node_texts = {
        node_ref_key(
            {
                "stable_source_key": record.payload.get("stable_source_key"),
                "version_label": record.payload.get("version_label"),
                "stable_node_key": record.payload.get("stable_node_key"),
            }
        ): str(record.payload.get("canonical_text", ""))
        for record in records
        if record.record_type == "node_version"
    }

    for index, record in enumerate(records):
        violations.extend(
            validate_record(record.to_json(), node_texts=node_texts, record_index=index)
        )

    unknown = sorted({record.record_type for record in records} - set(RECORD_TYPES))
    for name in unknown:
        violations.append(
            ContractViolation(code="RECORD_TYPE_UNKNOWN", message=f"unknown record_type {name!r}")
        )

    return RunRecords(run_dir, contract_version, tuple(stats), tuple(records), tuple(violations))
