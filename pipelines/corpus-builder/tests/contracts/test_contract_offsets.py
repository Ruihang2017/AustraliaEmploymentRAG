"""Text and offset rules (CRPS-01 deliverable 12; PRD §15.3; requirement `SRCH-003`).

Offsets are CHARACTER offsets into NFC-normalised `canonical_text`, half-open `[start, end)`. The
fixture text carries a pre-composed non-ASCII character and an astral-plane character on purpose:
those are exactly the inputs on which a UTF-8-byte or UTF-16-code-unit consumer mis-slices, and a
mis-sliced quotation is a wrong legal answer, not a cosmetic bug.
"""

from __future__ import annotations

import unicodedata
from pathlib import Path

import pytest

from contracts.io import read_run
from contracts.validate import node_ref_key, sha256_hex, validate_record

VALID_RUN = Path(__file__).resolve().parent / "fixtures" / "valid" / "run-001"
RUN = read_run(VALID_RUN)
NODE_VERSIONS = [record for record in RUN.records if record.record_type == "node_version"]
RELATIONS = [record for record in RUN.records if record.record_type == "node_relation"]

NODE_TEXTS = {
    node_ref_key(
        {
            "stable_source_key": record.payload["stable_source_key"],
            "version_label": record.payload["version_label"],
            "stable_node_key": record.payload["stable_node_key"],
        }
    ): record.payload["canonical_text"]
    for record in NODE_VERSIONS
}


@pytest.mark.parametrize(
    "payload", [record.payload for record in NODE_VERSIONS], ids=lambda p: p["stable_node_key"]
)
def test_canonical_text_is_nfc(payload: dict) -> None:
    text = payload["canonical_text"]
    assert unicodedata.normalize("NFC", text) == text


@pytest.mark.parametrize(
    "payload", [record.payload for record in NODE_VERSIONS], ids=lambda p: p["stable_node_key"]
)
def test_text_hash_is_sha256_of_the_utf8_bytes(payload: dict) -> None:
    assert payload["text_hash"] == sha256_hex(payload["canonical_text"])


def test_the_fixture_exercises_the_units_that_differ_between_languages() -> None:
    text = "".join(payload["canonical_text"] for payload in (r.payload for r in NODE_VERSIONS))
    assert any(0x7F < ord(character) < 0x10000 for character in text), "no BMP non-ASCII character"
    assert any(ord(character) > 0xFFFF for character in text), (
        "no astral-plane character — a UTF-16 consumer's off-by-N would go undetected"
    )
    assert len(text) < len(text.encode("utf-8")), "character length must differ from byte length"


@pytest.mark.parametrize(
    "payload", [record.payload for record in RELATIONS], ids=lambda p: p["relation_type"]
)
def test_every_evidence_range_is_a_valid_half_open_character_range(payload: dict) -> None:
    start, end = payload.get("evidence_start"), payload.get("evidence_end")
    if start is None and end is None:
        return
    text = NODE_TEXTS[node_ref_key(payload["evidence_ref"])]
    assert 0 <= start <= end <= len(text)
    assert text[start:end]  # the range actually names some text


def test_the_evidence_range_slices_the_expected_phrase() -> None:
    relation = RELATIONS[0].payload
    text = NODE_TEXTS[node_ref_key(relation["evidence_ref"])]
    assert text[relation["evidence_start"] : relation["evidence_end"]] == "section 4"


def test_a_byte_offset_mistaken_for_a_character_offset_is_caught() -> None:
    relation = dict(RELATIONS[0].payload)
    text = NODE_TEXTS[node_ref_key(relation["evidence_ref"])]
    relation["evidence_start"] = 0
    relation["evidence_end"] = len(text.encode("utf-8"))
    assert relation["evidence_end"] > len(text)

    record = dict(RELATIONS[0].to_json())
    record["payload"] = relation
    codes = [v.code for v in validate_record(record, node_texts=NODE_TEXTS)]
    assert codes == ["OFFSET_OUT_OF_RANGE"]


@pytest.mark.parametrize(
    ("start", "end"),
    [(5, 2), (-1, 4), (None, 4), (4, None)],
)
def test_a_malformed_offset_pair_is_reported(start: object, end: object) -> None:
    relation = dict(RELATIONS[0].payload)
    relation["evidence_start"], relation["evidence_end"] = start, end
    if start is None:
        relation.pop("evidence_start")
    if end is None:
        relation.pop("evidence_end")
    record = dict(RELATIONS[0].to_json())
    record["payload"] = relation
    assert [v.code for v in validate_record(record, node_texts=NODE_TEXTS)] == ["OFFSET_RANGE_INVALID"]


def test_a_range_ending_exactly_at_the_end_of_the_text_is_accepted() -> None:
    relation = dict(RELATIONS[0].payload)
    text = NODE_TEXTS[node_ref_key(relation["evidence_ref"])]
    relation["evidence_start"], relation["evidence_end"] = 0, len(text)
    record = dict(RELATIONS[0].to_json())
    record["payload"] = relation
    assert validate_record(record, node_texts=NODE_TEXTS) == []


def test_non_nfc_text_is_reported() -> None:
    record = dict(NODE_VERSIONS[0].to_json())
    payload = dict(record["payload"])
    decomposed = unicodedata.normalize("NFD", payload["canonical_text"])
    assert decomposed != payload["canonical_text"], "pick fixture text that actually decomposes"
    payload["canonical_text"] = decomposed
    payload["text_hash"] = sha256_hex(decomposed)
    record["payload"] = payload
    assert [v.code for v in validate_record(record)] == ["TEXT_NOT_NFC"]
