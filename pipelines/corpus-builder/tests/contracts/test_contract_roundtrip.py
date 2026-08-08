"""Byte-exact round-trip and manifest integrity (CRPS-01 deliverable 14).

The byte format is contract: a diff of two runs has to be meaningful, which it is not if the writer
reorders keys, changes spacing, or lets the platform decide the line ending.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from contracts.io import MANIFEST_NAME, encode_record, read_records, read_run, write_records, write_run

VALID_RUN = Path(__file__).resolve().parent / "fixtures" / "valid" / "run-001"
JSONL = sorted(VALID_RUN.glob("*.jsonl"))


@pytest.mark.parametrize("path", JSONL, ids=lambda p: p.name)
def test_write_of_what_was_read_reproduces_the_bytes(path: Path, tmp_path: Path) -> None:
    target = tmp_path / path.name
    write_records(target, list(read_records(path)))
    assert target.read_bytes() == path.read_bytes()


@pytest.mark.parametrize("path", JSONL, ids=lambda p: p.name)
def test_committed_hashes_and_counts_match_the_manifest(path: Path) -> None:
    manifest = json.loads((VALID_RUN / MANIFEST_NAME).read_text(encoding="utf-8"))
    entry = next(item for item in manifest["files"] if item["path"] == path.name)
    blob = path.read_bytes()
    assert hashlib.sha256(blob).hexdigest() == entry["sha256"]
    assert blob.count(b"\n") == entry["count"]


def test_rewriting_the_whole_run_reproduces_every_byte(tmp_path: Path) -> None:
    run = read_run(VALID_RUN)
    target = tmp_path / "run-001"
    write_run(target, run.records)
    for path in JSONL:
        assert (target / path.name).read_bytes() == path.read_bytes(), path.name
    assert (target / MANIFEST_NAME).read_bytes() == (VALID_RUN / MANIFEST_NAME).read_bytes()


def test_lines_are_sorted_key_compact_json_with_no_trailing_whitespace() -> None:
    for path in JSONL:
        for line in path.read_text(encoding="utf-8").splitlines():
            # Equality with the canonical encoding IS the compactness + key-order proof: any
            # reordering or added whitespace between tokens would change the string. A naive
            # substring check cannot be used, because a `*_json` member legitimately carries ", "
            # inside its own string content.
            assert line == encode_record(json.loads(line))
            assert line == line.rstrip()
            # ...and the default, spaced encoding must NOT match, so the check is not vacuous.
            assert json.dumps(json.loads(line), sort_keys=True) != line


def test_a_crlf_file_is_a_hard_error_not_silently_accepted(tmp_path: Path) -> None:
    """R-7: silently stripping CR would make round-trip determinism untestable on Windows."""
    source = JSONL[0]
    target = tmp_path / source.name
    target.write_bytes(source.read_bytes().replace(b"\n", b"\r\n"))
    with pytest.raises(ValueError, match="CRLF"):
        list(read_records(target))


def test_a_file_without_a_final_newline_is_rejected(tmp_path: Path) -> None:
    target = tmp_path / "node_version.jsonl"
    target.write_bytes(JSONL[0].read_bytes().rstrip(b"\n"))
    with pytest.raises(ValueError, match="newline"):
        list(read_records(target))


def test_a_tampered_file_is_caught_by_the_manifest_hash(tmp_path: Path) -> None:
    target = tmp_path / "run"
    target.mkdir()
    for path in [*JSONL, VALID_RUN / MANIFEST_NAME]:
        (target / path.name).write_bytes(path.read_bytes())
    victim = target / JSONL[0].name
    original = victim.read_bytes()
    tampered = original.replace(b"2026-07-01T02:15:00Z", b"2026-07-01T02:15:01Z")
    assert tampered != original and len(tampered) == len(original), "the tamper must be a real edit"
    victim.write_bytes(tampered)

    run = read_run(target)
    assert [violation.code for violation in run.violations] == ["MANIFEST_HASH_MISMATCH"]
    assert run.records == (), "no record may be yielded from a run whose manifest does not verify"


def test_a_truncated_file_is_caught_by_the_manifest_count(tmp_path: Path) -> None:
    target = tmp_path / "run"
    target.mkdir()
    for path in [*JSONL, VALID_RUN / MANIFEST_NAME]:
        (target / path.name).write_bytes(path.read_bytes())
    multi = next(path for path in JSONL if path.read_bytes().count(b"\n") > 1)
    lines = (target / multi.name).read_bytes().split(b"\n")[:-2]
    (target / multi.name).write_bytes(b"\n".join(lines) + b"\n")

    codes = {violation.code for violation in read_run(target).violations}
    assert "MANIFEST_COUNT_MISMATCH" in codes


def test_non_ascii_text_survives_the_round_trip_literally() -> None:
    node_versions = [
        record for record in read_run(VALID_RUN).records if record.record_type == "node_version"
    ]
    text = "".join(record.payload["canonical_text"] for record in node_versions)
    assert any(ord(character) > 0x7F for character in text), (
        "the fixture must exercise non-ASCII text, or the ensure_ascii=False rule is untested"
    )
    raw = (VALID_RUN / "node_version.jsonl").read_bytes()
    assert b"\\u" not in raw, "non-ASCII must be written literally, not as \\uXXXX escapes"
