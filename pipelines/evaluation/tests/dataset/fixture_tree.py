"""Build a complete synthetic evaluation tree in a temporary directory (deliverable 16).

Sub-PRD D18: synthetic only. Nothing here is derived from a real employer, employee or customer,
and no gold answer is asserted — the scenarios exist to be counted, hashed, sealed and duplicated on
purpose, not to be correct law.

Every deviation a negative fixture needs is a keyword argument, so a test varies EXACTLY one thing
and its failure names one rule. That is the construction pattern CRPS-02's `bundle_factory`
established and INGF-07's registry suite copied.

The three categories are real PRD §43.1 slugs with tiny counts of their own, because
`case.schema.json` constrains `primary_category` to the ten canonical slugs; the tree's own
`allocation.yaml` carries the small numbers, so `ALLOCATION_EXACT` is exercised against data rather
than against the repository's 600.

The seal key pair is generated IN THIS PROCESS and never written anywhere the test does not delete.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from dataset import blind, yaml_min
from dataset.model import content_sha256

#: (slug, code, development, validation, blind)
CATEGORIES: tuple[tuple[str, str, int, int, int], ...] = (
    ("federal-core", "FED", 2, 1, 1),
    ("case-treatment", "CAS", 1, 1, 1),
    ("safety-refusal", "SAF", 1, 1, 1),
)

#: Consistent triples taken from the CRPS-08 fixture release, so `GOLD_RESOLVES --release` can
#: actually resolve them. `document_version.id` / `node_version.id` / `legal_document.id`.
GOLD_TRIPLE = {
    "document_id": "doc_019fc4eb-9000-7dc3-94f9-322cef867fa2",
    "version_id": "dv_019fc4eb-9000-75d2-a447-262a960c6e32",
    "node_id": "nv_019fc4eb-9000-7f8c-9ff4-66be57bcfd4a",
}
SECOND_TRIPLE = {
    "document_id": "doc_019fc4eb-9000-7dc3-94f9-322cef867fa2",
    "version_id": "dv_019fc4eb-9000-76e0-9d80-6f76d2632b20",
    "node_id": "nv_019fc4eb-9000-79e8-b9d9-de6b525153b4",
}

#: One visible case per row: (category, number, split, surface, mode, status, extra)
_VISIBLE: tuple[dict[str, Any], ...] = (
    {"slug": "federal-core", "code": "FED", "n": 1, "split": "DEVELOPMENT", "surface": "ASK", "mode": "QUICK", "status": "SUPPORTED"},
    {"slug": "federal-core", "code": "FED", "n": 2, "split": "DEVELOPMENT", "surface": "SEARCH", "mode": "QUICK", "status": "CONDITIONAL"},
    {"slug": "federal-core", "code": "FED", "n": 3, "split": "VALIDATION", "surface": "COMPARE", "mode": "DEEP", "status": "SOURCE_NOT_CURRENT"},
    {"slug": "case-treatment", "code": "CAS", "n": 1, "split": "DEVELOPMENT", "surface": "COVERAGE", "mode": "DEEP", "status": "INSUFFICIENT_EVIDENCE"},
    {"slug": "case-treatment", "code": "CAS", "n": 2, "split": "VALIDATION", "surface": "ASK", "mode": "DEEP", "status": "CONFLICTING_SOURCES"},
    {"slug": "safety-refusal", "code": "SAF", "n": 1, "split": "DEVELOPMENT", "surface": "ASK", "mode": "QUICK", "status": "OUT_OF_SCOPE"},
    {"slug": "safety-refusal", "code": "SAF", "n": 2, "split": "VALIDATION", "surface": "MONITOR", "mode": "QUICK", "status": "SUPPORTED"},
)

#: One blind slot per category.
_BLIND: tuple[dict[str, Any], ...] = (
    {"slug": "federal-core", "code": "FED", "n": 4, "surface": "ASK"},
    {"slug": "case-treatment", "code": "CAS", "n": 3, "surface": "SEARCH"},
    {"slug": "safety-refusal", "code": "SAF", "n": 3, "surface": "ASK"},
)


def case_id(code: str, number: int) -> str:
    return f"EVAL-{code}-{number:03d}"


def visible_case(row: dict[str, Any], *, dataset_version: str = "v1") -> dict[str, Any]:
    identifier = case_id(row["code"], row["n"])
    gold = [] if row["status"] == "OUT_OF_SCOPE" else [
        {**GOLD_TRIPLE, "citation_role": "SUPPORTS", "required": True}
    ]
    document: dict[str, Any] = {
        "id": identifier,
        "dataset_version": dataset_version,
        "split": row["split"],
        "primary_category": row["slug"],
        "tags": [row["surface"]],
        "product_surface": row["surface"],
        "mode": row["mode"],
        "anonymous_scenario": f"Synthetic scenario {identifier}: an invented employer and an invented worker.",
        "question": f"Synthetic question {identifier} about an entirely invented workplace arrangement?",
        "legal_as_at": "2026-08-19",
        "jurisdictions": ["AU", "NSW"],
        "expected_answer_status": row["status"],
        "acceptable_statuses": [row["status"]],
        "required_facts": [f"fact {identifier}"],
        "prohibited_assumptions": [f"assumption {identifier}"],
        "trap_types": ["temporal"] if row["status"] != "OUT_OF_SCOPE" else ["PII_REJECTION"],
        "gold_authorities": gold,
        "required_claims": [f"claim {identifier}"],
        "optional_claims": [],
        "prohibited_claims": [f"prohibited {identifier}"],
        "latency_class": "STANDARD",
        "cost_class": "STANDARD",
        "author": "evaluation-author-agent",
        "reviewer": "evaluation-reviewer-agent",
        "change_reason": "initial authoring",
    }
    return document


def blind_plaintext(row: dict[str, Any]) -> dict[str, Any]:
    identifier = case_id(row["code"], row["n"])
    return {
        "id": identifier,
        "dataset_version": "v1",
        "split": "BLIND",
        "primary_category": row["slug"],
        "tags": [row["surface"]],
        "product_surface": row["surface"],
        "mode": "QUICK",
        "anonymous_scenario": f"Synthetic blind scenario {identifier} about an invented employer and an invented roster arrangement.",
        "question": f"Synthetic blind question {identifier} concerning an invented penalty rate on an invented public holiday?",
        "legal_as_at": "2026-08-19",
        "jurisdictions": ["AU"],
        "expected_answer_status": "SUPPORTED",
        "acceptable_statuses": ["SUPPORTED"],
        "required_facts": [f"blind fact {identifier}"],
        "prohibited_assumptions": [f"blind assumption {identifier}"],
        "trap_types": ["temporal"],
        "gold_authorities": [{**SECOND_TRIPLE, "citation_role": "SUPPORTS", "required": True}],
        "required_claims": [f"blind claim {identifier}"],
        "optional_claims": [],
        "prohibited_claims": [f"blind prohibited {identifier}"],
        "latency_class": "STANDARD",
        "cost_class": "STANDARD",
        "author": "evaluation-author-agent",
        "reviewer": "evaluation-reviewer-agent",
        "change_reason": "initial authoring",
    }


def build_fixture_tree(
    base: Path,
    *,
    recipient_public: bytes,
    recipient_key_id: str = "dev-fixture-recipient-001",
    # --- one knob per negative fixture, each varying exactly one thing --------------------------
    miscount_category: str | None = None,
    duplicate_id_into: str | None = None,
    duplicate_question_between: tuple[str, str] | None = None,
    drop_envelope_for: str | None = None,
    corrupt_envelope_for: str | None = None,
    extra_sidecar_field: str | None = None,
    plaintext_under_blind: str | None = None,
    unsealed_plaintext_in: str | None = None,
    private_key_file_in: str | None = None,
    break_node_id_for: str | None = None,
    inconsistent_gold_for: str | None = None,
    requirement_shaped_id_for: str | None = None,
    edit_question_of: str | None = None,
    edit_expected_output_of: str | None = None,
    register_version: bool = True,
    canary: str | None = None,
    missing_trap_floor: str | None = None,
) -> Path:
    """Write a complete tree under `base/evals` and return that directory."""
    root = base / "evals"
    (root / "splits" / "dataset-versions").mkdir(parents=True, exist_ok=True)
    (root / "splits" / "migrations").mkdir(parents=True, exist_ok=True)

    counts = {slug: [dev, val, bli] for slug, _code, dev, val, bli in CATEGORIES}
    if miscount_category is not None:
        counts[miscount_category][0] += 1

    _write_yaml(
        root / "splits" / "allocation.yaml",
        {
            "prd_section": "43.1",
            "dataset_major_version": 1,
            "categories": [
                {
                    "slug": slug,
                    "code": code,
                    "ticket": "GOLD-01-fixture",
                    "title": f"synthetic {slug}",
                    "development": counts[slug][0],
                    "validation": counts[slug][1],
                    "blind": counts[slug][2],
                    "total": sum(counts[slug]),
                }
                for slug, code, _d, _v, _b in CATEGORIES
            ],
            "totals": {
                "development": sum(counts[slug][0] for slug in counts),
                "validation": sum(counts[slug][1] for slug in counts),
                "blind": sum(counts[slug][2] for slug in counts),
                "total": sum(sum(counts[slug]) for slug in counts),
            },
        },
    )
    _write_yaml(
        root / "splits" / "id-rules.yaml",
        {
            "prefix": "EVAL",
            "pattern": "^EVAL-(FED|AWD|AGR|PAY|STE|WHS|ADJ|CAS|TMP|SAF)-[0-9]{3}$",
            "codes": [code for _slug, code, _d, _v, _b in CATEGORIES],
        },
    )
    (root / "splits" / blind.RECIPIENT_FILENAME).write_text(
        json.dumps(
            {
                "key_id": recipient_key_id,
                "algorithm": "crypto_box_seal",
                "kind": "EPHEMERAL_TEST",
                "blind_dataset_major_version": 1,
                "public_key_base64": base64.b64encode(recipient_public).decode("ascii"),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Keyed by the case's ORIGINAL id, so a knob that rewrites the id (requirement_shaped_id_for)
    # does not also move the entry every later step looks it up by.
    documents: dict[str, dict[str, Any]] = {}
    for row in _VISIBLE:
        document = visible_case(row)
        key = document["id"]
        if requirement_shaped_id_for == document["id"]:
            document["id"] = "EVAL-001"
        if break_node_id_for == document["id"]:
            document["gold_authorities"][0]["node_id"] = "nv_00000000-0000-7000-8000-000000000000"
        if inconsistent_gold_for == document["id"]:
            document["gold_authorities"][0]["node_id"] = SECOND_TRIPLE["node_id"]
        if canary is not None and document["id"] == case_id("FED", 1):
            document["question"] = f"{document['question']} {canary}"
            document["anonymous_scenario"] = f"{document['anonymous_scenario']} {canary}"
        documents[key] = document

    if duplicate_question_between is not None:
        source, target = duplicate_question_between
        documents[target]["question"] = documents[source]["question"]
        documents[target]["anonymous_scenario"] = documents[source]["anonymous_scenario"]

    registry_rows: list[dict[str, Any]] = []
    for row in _VISIBLE:
        identifier = case_id(row["code"], row["n"])
        document = documents[identifier]
        registry_rows.append(
            {
                "id": document["id"],
                "split": document["split"],
                "primary_category": row["slug"],
                "content_sha256": content_sha256(document),
                "expected_output_sha256": _expected_output_digest(document),
            }
        )

    # Post-registration edits: the registry above is the BASELINE, so an edit made after it is
    # exactly the invisible correction PRD §14.3 forbids.
    if edit_question_of is not None:
        documents[edit_question_of]["question"] += " (edited without a new version)"
    if edit_expected_output_of is not None:
        documents[edit_expected_output_of]["required_claims"] = ["a different expected claim"]
        documents[edit_expected_output_of]["dataset_version"] = "v2"
        documents[edit_expected_output_of]["change_reason"] = "corrected after review"
        documents[edit_expected_output_of]["approved_by"] = "founder"

    for row in _VISIBLE:
        slug = row["slug"]
        directory = root / "cases" / slug
        directory.mkdir(parents=True, exist_ok=True)
        document = documents[case_id(row["code"], row["n"])]
        _write_yaml(directory / f"{case_id(row['code'], row['n'])}.yaml", document)

    if duplicate_id_into is not None:
        source = documents[case_id("FED", 1)]
        clone = dict(source)
        clone["split"] = "VALIDATION"
        clone["primary_category"] = duplicate_id_into
        _write_yaml(root / "cases" / duplicate_id_into / f"{source['id']}.yaml", clone)

    for row in _BLIND:
        slug = row["slug"]
        identifier = case_id(row["code"], row["n"])
        blind_dir = root / "cases" / slug / "blind"
        blind_dir.mkdir(parents=True, exist_ok=True)
        plaintext = yaml_min.dump(blind_plaintext(row)).encode("utf-8")
        envelope, _ciphertext = blind.seal(
            plaintext,
            recipient_public,
            case_id=identifier,
            recipient_key_id=recipient_key_id,
            blind_dataset_major_version=1,
            sealer="evaluation-author-agent",
            sealed_at="2026-08-19T00:00:00Z",
        )
        if corrupt_envelope_for == identifier:
            raw = bytearray(base64.b64decode(envelope["ciphertext_b64"]))
            raw[-1] ^= 0x01
            envelope["ciphertext_b64"] = base64.b64encode(bytes(raw)).decode("ascii")
        sidecar = {
            "id": identifier,
            "split": "BLIND",
            "primary_category": slug,
            "tags": [row["surface"]],
            "trap_types": ["temporal"],
            "jurisdictions": ["AU"],
            "product_surface": row["surface"],
            "latency_class": "STANDARD",
            "cost_class": "STANDARD",
            "author": "evaluation-author-agent",
            "reviewer": "evaluation-reviewer-agent",
            "change_reason": "initial authoring",
            "envelope_digest": envelope["ciphertext_sha256"],
        }
        if extra_sidecar_field == identifier:
            sidecar["question"] = "a field that carries content and is not on the allowlist"
        _write_yaml(blind_dir / f"{identifier}.sidecar.yaml", sidecar)
        registry_rows.append(
            {
                "id": identifier,
                "split": "BLIND",
                "primary_category": slug,
                "content_sha256": content_sha256(sidecar),
                "envelope_sha256": envelope["ciphertext_sha256"],
            }
        )
        if drop_envelope_for != identifier:
            (blind_dir / f"{identifier}.envelope.json").write_text(
                json.dumps(envelope, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )

    if plaintext_under_blind is not None:
        target = root / "cases" / plaintext_under_blind / "blind" / "leaked-case.yaml"
        target.parent.mkdir(parents=True, exist_ok=True)
        _write_yaml(target, {"id": "EVAL-FED-099", "question": "plaintext that must never be here"})
    if unsealed_plaintext_in is not None:
        target = root / "cases" / unsealed_plaintext_in / "blind" / "unsealed" / "draft.yaml"
        target.parent.mkdir(parents=True, exist_ok=True)
        _write_yaml(target, {"id": "EVAL-FED-098", "question": "an authoring draft that was committed"})
    if private_key_file_in is not None:
        target = root / "cases" / private_key_file_in / "operator.pem"
        header = "-" * 5 + "BEGIN" + " " + "PRIVATE" + " " + "KEY" + "-" * 5
        target.write_text(header + "\nnot-real-material\n", encoding="utf-8")

    for slug, code, dev, val, bli in CATEGORIES:
        traps = ["temporal"]
        if missing_trap_floor == slug:
            traps = ["a-trap-no-case-carries"]
        _write_yaml(
            root / "cases" / slug / "stratification.yaml",
            {
                "category": slug,
                "code": code,
                "counts": {
                    "development": counts[slug][0],
                    "validation": counts[slug][1],
                    "blind": counts[slug][2],
                    "total": sum(counts[slug]),
                },
                "jurisdiction_floors": [{"key": "AU", "minimum": 1}],
                "product_surface_floors": [{"key": "ASK", "minimum": 1}]
                if slug != "case-treatment"
                else [{"key": "COVERAGE", "minimum": 1}],
                "answer_status_floors": [],
                "required_trap_types": traps,
            },
        )
        del code, dev, val, bli

    if register_version:
        _write_json(
            root / "splits" / "dataset-versions" / "v1.json",
            {
                "version": "v1",
                "created_at": "2026-08-19T00:00:00Z",
                "approved_by": "founder",
                "reason": "synthetic fixture baseline",
                "cases": sorted(registry_rows, key=lambda row: row["id"]),
            },
        )
        if edit_expected_output_of is not None:
            # The correction WAS versioned — `version new` was run — so the only rule still
            # outstanding is the migration record. That is what this negative fixture isolates:
            # without the v2 registry the tree would fail for the invisible-edit reason instead,
            # and a negative fixture that fails for the wrong reason proves nothing.
            corrected = dict(documents[edit_expected_output_of])
            v2_rows = []
            for row in registry_rows:
                if row["id"] != edit_expected_output_of:
                    v2_rows.append(dict(row))
                    continue
                v2_rows.append(
                    {
                        **row,
                        "content_sha256": content_sha256(corrected),
                        "expected_output_sha256": _expected_output_digest(corrected),
                    }
                )
            _write_json(
                root / "splits" / "dataset-versions" / "v2.json",
                {
                    "version": "v2",
                    "created_at": "2026-08-20T00:00:00Z",
                    "approved_by": "founder",
                    "reason": "corrected after review",
                    "supersedes": "v1",
                    "cases": sorted(v2_rows, key=lambda row: row["id"]),
                },
            )
    return root


def _expected_output_digest(document: dict[str, Any]) -> str:
    from dataset.model import EXPECTED_OUTPUT_FIELDS

    return content_sha256({name: document.get(name) for name in EXPECTED_OUTPUT_FIELDS})


def _write_yaml(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml_min.dump(document), encoding="utf-8")


def _write_json(path: Path, document: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n", encoding="utf-8")
