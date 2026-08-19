"""`BLIND_SEALED` — every BLIND case is exactly one envelope plus one allowlisted sidecar, and no
blind plaintext exists anywhere in the tree (PRD §14.3, §43.1; sub-PRD D1).

This is the check that turns PRD §14.3 from a policy into a mechanism. It needs NO key: the whole
point is that it runs in ordinary CI, on every branch and in every agent session, where by
construction no private key exists.

`guard_blind_paths()` is the key-less, dataset-less half, exported for `blind.guard()` so
`guard-blind` can run over a raw checkout before anything is composed. It refuses:

  a. any file under a `blind/` path that is not an envelope or a sidecar — i.e. plaintext;
  b. a BLIND case with no envelope, or with more than one;
  c. an envelope whose ciphertext digest disagrees with its own descriptor or with the sidecar;
  d. a sidecar carrying a non-allowlisted field (`blind-sidecar.schema.json` is the allowlist);
  e. an envelope sealed with anything but `crypto_box_seal`.

Note the direction of (a): it is an allowlist of filenames, not a denylist of suspicious ones. A
denylist would pass every plaintext file whose name nobody predicted.

(c) and (e) are stated as TWO comparisons on purpose, and both halves are enforced here rather than
only in `check()`: the envelope must agree with itself, AND the sidecar must agree with the
envelope. The second is what detects a swapped, restored or hand-edited envelope — the sidecar is
the only description of a blind slot anyone without the key can read, so metadata that has come
apart from its sealed material is precisely the failure a key-less guard exists to catch. A guard
that ran the weaker half of a rule its own docstring claimed would be worse than one that claimed
less.
"""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

from ..compose import BLIND_DIRNAME, ENVELOPE_SUFFIX, SIDECAR_SUFFIX
from ..findings import Finding
from ..model import Dataset
from . import CheckContext
from ._common import categories

_ID = "BLIND_SEALED"
_ALGORITHM = "crypto_box_seal"

#: The sidecar allowlist, kept in step with `schemas/evaluation/blind-sidecar.schema.json` by
#: `tests/dataset/test_case_schema_fields.py` — which asserts the schema's property set equals the
#: ticket's list — and read from the schema here so there is one source, not two.
_SIDECAR_SCHEMA = "blind-sidecar.schema.json"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    allowlist = _allowlist(context.schemas_dir)

    for entry in categories(dataset, context.category):
        blind_dir = entry.path / BLIND_DIRNAME
        if blind_dir.is_dir():
            findings.extend(_stray_files(entry.slug, blind_dir))

        for sidecar in entry.sidecars:
            path = str(sidecar.path)
            extra = sorted(set(sidecar.raw) - allowlist)
            if extra:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        sidecar.id,
                        f"sidecar carries {len(extra)} non-allowlisted field(s): {', '.join(extra)}",
                        path,
                    )
                )
            envelope = sidecar.envelope
            if envelope is None:
                findings.append(
                    Finding(_ID, "FAIL", entry.slug, sidecar.id, "the BLIND case has no sealed envelope", path)
                )
                continue
            findings.extend(_envelope(entry.slug, sidecar.id, envelope.raw, str(envelope.path)))
            if sidecar.envelope_digest != envelope.raw.get("ciphertext_sha256"):
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        sidecar.id,
                        "the sidecar's envelope_digest does not match the envelope's ciphertext_sha256",
                        path,
                    )
                )

        envelope_ids = {
            path.name[: -len(ENVELOPE_SUFFIX)]
            for path in sorted((entry.path / BLIND_DIRNAME).glob(f"*{ENVELOPE_SUFFIX}"))
        } if (entry.path / BLIND_DIRNAME).is_dir() else set()
        sidecar_ids = {sidecar.id for sidecar in entry.sidecars}
        for orphan in sorted(envelope_ids - sidecar_ids):
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    entry.slug,
                    orphan,
                    "a sealed envelope has no sidecar, so the slot cannot be counted or stratified",
                    str(entry.path / BLIND_DIRNAME / f"{orphan}{ENVELOPE_SUFFIX}"),
                )
            )

        for case in entry.cases:
            if case.split == "BLIND":
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        entry.slug,
                        case.id,
                        "a BLIND case exists as a plaintext case file; blind content lives in the "
                        "repository only as ciphertext (sub-PRD D1)",
                        str(case.path),
                    )
                )
    return findings


def _allowlist(schemas_dir: Path) -> set[str]:
    document = json.loads((schemas_dir / _SIDECAR_SCHEMA).read_text(encoding="utf-8"))
    return set(document["properties"])


def _stray_files(slug: str, blind_dir: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in sorted(blind_dir.rglob("*")):
        if not path.is_file():
            continue
        name = path.name
        if name.endswith(ENVELOPE_SUFFIX) or name.endswith(SIDECAR_SUFFIX):
            continue
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                path.name.split(".")[0] or None,
                "a file under a blind/ path is neither a sealed envelope nor a sidecar, so it is "
                "plaintext by elimination",
                str(path),
            )
        )
    return findings


def _envelope(slug: str, case_id: str, document: Mapping[str, Any], path: str) -> list[Finding]:
    findings: list[Finding] = []
    if document.get("algorithm") != _ALGORITHM:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                case_id,
                f"envelope algorithm is not {_ALGORITHM}; the primitive belongs to a CONFIRMED "
                "decision (breakdown plan §8 Q6, sub-PRD D22)",
                path,
            )
        )
    try:
        ciphertext = base64.b64decode(document["ciphertext_b64"], validate=True)
    except (KeyError, ValueError, TypeError):
        findings.append(
            Finding(_ID, "FAIL", slug, case_id, "envelope ciphertext_b64 is missing or not base64", path)
        )
        return findings
    digest = hashlib.sha256(ciphertext).hexdigest()
    if document.get("ciphertext_sha256") != digest:
        findings.append(
            Finding(
                _ID,
                "FAIL",
                slug,
                case_id,
                "the envelope's ciphertext_sha256 does not match its own ciphertext",
                path,
            )
        )
    if document.get("byte_length") != len(ciphertext):
        findings.append(
            Finding(_ID, "FAIL", slug, case_id, "the envelope's byte_length does not match its ciphertext", path)
        )
    if document.get("case_id") != case_id:
        findings.append(
            Finding(_ID, "FAIL", slug, case_id, "the envelope names a different case_id than its sidecar", path)
        )
    return findings


# -- the key-less repository guard (`blind.guard()` / `guard-blind`) --------------------------------


def guard_blind_paths(
    root: Path, files: Iterable[Path], schemas_dir: Path | None = None
) -> list[Finding]:
    """Deliverable 12 check 10 over a raw file list, with nothing composed and no key.

    A TRACKED file under a `blind/unsealed/**` path is a FAIL even though `evals/.gitignore` names
    that path: the ignore file is a convenience and this is the control (deliverable 15).
    """
    from ..paths import SCHEMAS_DIR

    findings: list[Finding] = []
    allowlist = _allowlist(schemas_dir or SCHEMAS_DIR)
    #: case id -> the digest computed from the envelope's OWN ciphertext bytes.
    digests: dict[str, str] = {}
    #: case id -> (path, the digest the sidecar claims, or None when it names none). Collected
    #: rather than checked in place because a sidecar may be read before its envelope.
    claimed: dict[str, tuple[Path, str | None]] = {}
    sidecars: dict[str, Path] = {}
    envelopes: dict[str, Path] = {}
    categories_by_case: dict[str, str] = {}

    for path in files:
        parts = path.parts
        if BLIND_DIRNAME not in parts:
            continue
        try:
            category = parts[parts.index(BLIND_DIRNAME) - 1]
        except (ValueError, IndexError):  # pragma: no cover — defensive
            category = "<unknown>"
        name = path.name
        if "unsealed" in parts:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    category,
                    None,
                    "a tracked file sits under a blind/unsealed/ path; blind plaintext is never "
                    "committed (breakdown plan §8 Q6 item 4)",
                    str(path.relative_to(root) if path.is_relative_to(root) else path),
                )
            )
            continue
        if name.endswith(SIDECAR_SUFFIX):
            case_id = name[: -len(SIDECAR_SUFFIX)]
            sidecars[case_id] = path
            categories_by_case.setdefault(case_id, category)
            sidecar_findings, declared = _guard_sidecar(category, case_id, path, allowlist)
            findings.extend(sidecar_findings)
            claimed[case_id] = (path, declared)
            continue
        if name.endswith(ENVELOPE_SUFFIX):
            case_id = name[: -len(ENVELOPE_SUFFIX)]
            envelopes[case_id] = path
            categories_by_case.setdefault(case_id, category)
            try:
                document = json.loads(path.read_text(encoding="utf-8"))
                ciphertext = base64.b64decode(document["ciphertext_b64"], validate=True)
            except (OSError, ValueError, KeyError, TypeError):
                findings.append(
                    Finding(_ID, "FAIL", category, case_id, "the sealed envelope is unreadable", str(path))
                )
                continue
            digest = hashlib.sha256(ciphertext).hexdigest()
            if document.get("ciphertext_sha256") != digest:
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        category,
                        case_id,
                        "the envelope's recorded digest does not match its ciphertext",
                        str(path),
                    )
                )
            if document.get("algorithm") != _ALGORITHM:
                # Rule (e) of this module's docstring, enforced in the key-less guard as well.
                findings.append(
                    Finding(
                        _ID,
                        "FAIL",
                        category,
                        case_id,
                        f"envelope algorithm is not {_ALGORITHM}; the primitive belongs to a "
                        "CONFIRMED decision (breakdown plan §8 Q6, sub-PRD D22)",
                        str(path),
                    )
                )
            digests[case_id] = digest
            continue
        findings.append(
            Finding(
                _ID,
                "FAIL",
                category,
                None,
                "a file under a blind/ path is neither a sealed envelope nor a sidecar, so it is "
                "plaintext by elimination",
                str(path),
            )
        )

    # The sidecar <-> envelope cross-check, which is half of what makes the sidecar trustworthy:
    # the sidecar is the only description of a blind slot anyone can read, so a sidecar pointing at
    # a digest its envelope does not have means the metadata and the sealed material have come
    # apart — a swapped, restored or hand-edited envelope. `check()` above performs the same
    # comparison for a composed dataset; `guard-blind` runs over a raw checkout with nothing
    # composed and must not be the weaker of the two (deliverable 12 check 10).
    for case_id in sorted(claimed):
        sidecar_path, declared = claimed[case_id]
        actual = digests.get(case_id)
        if actual is None:
            # No readable envelope: already reported as a missing or unreadable envelope below or
            # above. Reporting it twice would say nothing new.
            continue
        category = categories_by_case.get(case_id, "<blind>")
        if declared is None:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    category,
                    case_id,
                    "the blind sidecar names no envelope_digest, so nothing ties it to the sealed "
                    "material it describes",
                    str(sidecar_path),
                )
            )
        elif declared != actual:
            findings.append(
                Finding(
                    _ID,
                    "FAIL",
                    category,
                    case_id,
                    "the sidecar's envelope_digest does not match the envelope's ciphertext",
                    str(sidecar_path),
                )
            )

    for case_id in sorted(set(sidecars) - set(envelopes)):
        findings.append(
            Finding(_ID, "FAIL", "<blind>", case_id, "the BLIND case has no sealed envelope", str(sidecars[case_id]))
        )
    for case_id in sorted(set(envelopes) - set(sidecars)):
        findings.append(
            Finding(_ID, "FAIL", "<blind>", case_id, "a sealed envelope has no sidecar", str(envelopes[case_id]))
        )
    return findings


def _guard_sidecar(
    category: str, case_id: str, path: Path, allowlist: set[str]
) -> tuple[list[Finding], str | None]:
    """Read one sidecar. Returns `(findings, the envelope_digest it declares)`.

    A sidecar that will not parse is itself a FAIL, and declares nothing. The parse failure is
    reported by CODE only — never by quoting the file, which under a `blind/` path would be the
    plaintext this whole module exists to keep sealed.
    """
    from .. import yaml_min

    try:
        document = yaml_min.load_path(path)
    except (OSError, yaml_min.YamlError):
        return [Finding(_ID, "FAIL", category, case_id, "the blind sidecar is unreadable", str(path))], None
    if not isinstance(document, dict):
        return [Finding(_ID, "FAIL", category, case_id, "the blind sidecar is not a mapping", str(path))], None
    declared = document.get("envelope_digest")
    declared = declared if isinstance(declared, str) and declared else None
    extra = sorted(set(document) - allowlist)
    if not extra:
        return [], declared
    return [
        Finding(
            _ID,
            "FAIL",
            category,
            case_id,
            f"sidecar carries {len(extra)} non-allowlisted field(s): {', '.join(extra)}",
            str(path),
        )
    ], declared
