"""`verify_bundle()` — the single trust gate for a CorpusRelease bundle (CRPS-02 deliverable 10).

CRPS-06 and CRPS-08 call it; RETR-01 (Rust) and RLSE-07 re-implement it against the same contract.
PRD §21: *"Trust application/corpus artifacts only after signature/hash/compatibility
verification."*

SECURITY MODEL, stated because a reviewer must be able to check it.

1. **Every path in `files[]` is untrusted until the signature verifies — and the signature check is
   not allowed to stop the walk**, because deliverable 10 requires the whole picture rather than the
   first failure. So every path is validated BEFORE any I/O: relative, POSIX, no `..` segment, no
   drive letter, no leading separator, and the resolved path must lie inside the resolved bundle
   directory. A path that fails is a finding and is never opened. Symlinks are refused, not
   followed.
2. **`report.ok` is the only trust signal.** It is false whenever any BLOCKING finding is present.
   No caller may act on a partial list.
3. **Nothing is written.** The corpus database is opened `read_only=True` (a SQLite `mode=ro` URI)
   and closed in a `finally` — an open handle on Windows also blocks a caller's temp-directory
   teardown. A corrupt or hostile database yields `CORPUS_DATABASE_UNREADABLE`, never an exception
   out of this function.
4. **Size is checked from `stat()` before the file is read**, so a manifest claiming an absurd
   `byte_size` short-circuits instead of driving a large read; hashing then streams in 1 MiB blocks.
5. **The signature does not cover `signature` or `manifest_sha256`** (see `canonical.py`).
   Consequence: `signature.signed_at` is unauthenticated. Documented in the schema, the README and
   ADR 0002 so no consumer treats it as evidence.
"""

from __future__ import annotations

import hmac
import json
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from contracts.jsonschema_min import Draft202012Validator
from contracts.schema import open_corpus_database
from contracts.version import major_of

from .builder import (
    BUNDLE_LEXICAL_INDEX_DIR,
    MANIFEST_FILENAME,
    directory_digest,
    file_sha256,
)
from .canonical import NonCanonicalValue, manifest_sha256 as _digest_of
from .findings import Finding, VerificationReport
from .paths import schema_dir, schema_documents
from .signing import verify_signature

__all__ = [
    "Compatibility",
    "PRD_BUNDLE_PATHS",
    "RELEASE_SCHEMA_ID",
    "EMBEDDING_SCHEMA_ID",
    "is_stub",
    "verify_bundle",
]

RELEASE_SCHEMA_ID = "https://taxrag.local/schemas/corpus-manifest/v1/release-manifest.schema.json"
EMBEDDING_SCHEMA_ID = "https://taxrag.local/schemas/corpus-manifest/v1/embedding-manifest.schema.json"

_CORPUS_DATABASE = "corpus.sqlite"
_VECTOR_INDEX = "vectors.usearch"
_EMBEDDING_MANIFEST = "embedding-manifest.json"

#: PRD §18.4's fixed layout. A trailing '/' marks the one directory entry.
PRD_BUNDLE_PATHS: tuple[str, ...] = (
    _CORPUS_DATABASE,
    f"{BUNDLE_LEXICAL_INDEX_DIR}/",
    _VECTOR_INDEX,
    _EMBEDDING_MANIFEST,
    MANIFEST_FILENAME,
)

_DRIVE = re.compile(r"^[A-Za-z]:")

#: CRPS-05 deliverable 2's convention: a placeholder model id is `stub` or `stub:<seed>`.
_STUB_PREFIX = "stub:"


@dataclass(frozen=True)
class Compatibility:
    """What the CONSUMER is, for step 8. Members left `None` are simply not compared."""

    app_version: str | None = None
    search_version: str | None = None
    corpus_schema: str | None = None


def is_stub(value: Any) -> bool:
    """Whether *value* is a stub/placeholder marker (deliverable 13)."""
    if not isinstance(value, str):
        return False
    text = value.strip().lower()
    return text == "stub" or text.startswith(_STUB_PREFIX)


# ==================================================================================================
# Path safety
# ==================================================================================================


def _unsafe_reason(bundle_dir: Path, candidate: Any) -> str | None:
    """Why *candidate* may not be opened, or `None` when it is safe. No I/O beyond `resolve()`."""
    if not isinstance(candidate, str) or not candidate:
        return "the path is missing or is not a string"
    if "\\" in candidate:
        return "the path uses a backslash; bundle paths are POSIX and '/'-separated"
    if candidate.startswith("/"):
        return "the path is absolute"
    if _DRIVE.match(candidate):
        return "the path carries a drive letter"
    segments = candidate.split("/")
    if any(segment in ("", ".", "..") for segment in segments):
        return "the path has an empty, '.' or '..' segment"
    root = bundle_dir.resolve()
    try:
        resolved = (root / candidate).resolve()
    except OSError:
        return "the path cannot be resolved"
    if resolved != root and root not in resolved.parents:
        return "the path resolves outside the bundle directory"
    return None


def _on_disk_files(bundle_dir: Path) -> tuple[list[str], list[str]]:
    """`(regular file paths, non-regular entries)` beneath *bundle_dir*, POSIX-relative and sorted.

    Symlinks are reported, never followed: the walk uses `rglob`, which does not descend into a
    symlinked directory's target because such an entry is reported and skipped here first.
    """
    regular: list[str] = []
    irregular: list[str] = []
    for path in bundle_dir.rglob("*"):
        relative = path.relative_to(bundle_dir).as_posix()
        if path.is_symlink():
            irregular.append(relative)
            continue
        if path.is_dir():
            continue
        if path.is_file():
            regular.append(relative)
        else:
            irregular.append(relative)
    return sorted(regular), sorted(irregular)


# ==================================================================================================
# Steps
# ==================================================================================================


def _load_manifest(bundle_dir: Path, findings: list[Finding]) -> Mapping[str, Any] | None:
    path = bundle_dir / MANIFEST_FILENAME
    if not path.is_file():
        findings.append(
            Finding(
                "MANIFEST_ABSENT",
                "BLOCKING",
                f"{MANIFEST_FILENAME} is absent; PRD §18.4 fixes it in the release layout",
                MANIFEST_FILENAME,
            )
        )
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        findings.append(
            Finding(
                "MANIFEST_UNPARSEABLE",
                "BLOCKING",
                f"{MANIFEST_FILENAME} is not parseable JSON: {error}",
                MANIFEST_FILENAME,
            )
        )
        return None
    if not isinstance(document, dict):
        findings.append(
            Finding(
                "MANIFEST_UNPARSEABLE",
                "BLOCKING",
                f"{MANIFEST_FILENAME} does not contain a JSON object",
                MANIFEST_FILENAME,
            )
        )
        return None
    return document


def _validate_against_schema(
    document: Mapping[str, Any],
    schema_id: str,
    subject: str,
    code: str,
    findings: list[Finding],
) -> None:
    """Deliverable 9: the schema directory is `v<major>` of the document's own `manifest_version`.

    The verifier accepts the current major and the immediately previous major. An unsupported
    version is BLOCKING and schema validation is SKIPPED with that reason stated — never passed.
    """
    raw_version = document.get("manifest_version")
    try:
        major = major_of(str(raw_version))
    except ValueError:
        findings.append(
            Finding(
                "MANIFEST_VERSION_UNSUPPORTED",
                "BLOCKING",
                f"manifest_version {raw_version!r} is not semver, so the schema major version it "
                "should be validated against cannot be determined; validation was skipped",
                f"{subject}.manifest_version",
            )
        )
        return
    current = major_of(_current_major_source())
    if major not in (current, current - 1) or not schema_dir(major).is_dir():
        findings.append(
            Finding(
                "MANIFEST_VERSION_UNSUPPORTED",
                "BLOCKING",
                f"manifest_version {raw_version!r} needs schemas/corpus-manifest/v{major}, which "
                f"this verifier does not carry (it accepts v{current} and v{current - 1}); schema "
                "validation was skipped",
                f"{subject}.manifest_version",
            )
        )
        return
    documents = schema_documents(major)
    schema = documents.get(schema_id)
    if schema is None:  # pragma: no cover — a missing contract file is a packaging defect
        raise FileNotFoundError(f"{schema_id} is not among the v{major} schema documents")
    # An UnsupportedKeywordError is deliberately NOT caught: it means this repository's schema uses
    # a keyword the validator cannot enforce, which is an authoring defect in our own contract, and
    # reporting an unenforced schema as satisfied is the one failure mode jsonschema_min exists to
    # prevent.
    validator = Draft202012Validator(schema, documents=documents)
    for error in validator.iter_errors(document):
        pointer = "/".join(str(part) for part in error.path)
        findings.append(
            Finding(
                code,
                "BLOCKING",
                f"{subject} fails its schema at {pointer or '<root>'}: {error.message}",
                f"{subject}/{pointer}" if pointer else subject,
            )
        )


def _current_major_source() -> str:
    from .model import MANIFEST_VERSION

    return MANIFEST_VERSION


def _check_digest(document: Mapping[str, Any], findings: list[Finding]) -> None:
    recorded = document.get("manifest_sha256")
    try:
        recomputed = _digest_of(document)
    except NonCanonicalValue as error:
        findings.append(
            Finding(
                "MANIFEST_SHA256_MISMATCH",
                "BLOCKING",
                f"the manifest cannot be canonicalised, so its digest cannot be checked: {error}",
                "manifest_sha256",
            )
        )
        return
    if not isinstance(recorded, str) or not hmac.compare_digest(recorded, recomputed):
        findings.append(
            Finding(
                "MANIFEST_SHA256_MISMATCH",
                "BLOCKING",
                f"manifest_sha256 records {recorded!r} but the manifest's canonical form digests to "
                f"{recomputed!r}; the manifest has been altered since it was built",
                "manifest_sha256",
            )
        )


def _check_layout_and_files(
    bundle_dir: Path, document: Mapping[str, Any], findings: list[Finding]
) -> dict[str, str]:
    """Steps 4 and 5. Returns the `{path: verified sha256}` map step 6 cross-checks."""
    for entry in PRD_BUNDLE_PATHS:
        target = bundle_dir / entry.rstrip("/")
        present = target.is_dir() if entry.endswith("/") else target.is_file()
        if not present:
            findings.append(
                Finding(
                    "BUNDLE_PATH_MISSING",
                    "BLOCKING",
                    f"PRD §18.4 fixes {entry} in the release layout, and it is absent",
                    entry,
                )
            )

    on_disk, irregular = _on_disk_files(bundle_dir)
    for relative in irregular:
        findings.append(
            Finding(
                "FILE_NOT_REGULAR",
                "BLOCKING",
                f"{relative} is a symlink or another non-regular entry; a release bundle contains "
                "regular files only, and this verifier does not follow it",
                relative,
            )
        )

    listed = document.get("files")
    if not isinstance(listed, list):
        return {}

    verified: dict[str, str] = {}
    listed_paths: set[str] = set()
    for index, entry in enumerate(listed):
        subject = f"files[{index}]"
        if not isinstance(entry, Mapping):
            findings.append(
                Finding("BUNDLE_PATH_UNSAFE", "BLOCKING", f"{subject} is not an object", subject)
            )
            continue
        candidate = entry.get("path")
        reason = _unsafe_reason(bundle_dir, candidate)
        if reason is not None:
            findings.append(
                Finding(
                    "BUNDLE_PATH_UNSAFE",
                    "BLOCKING",
                    f"{subject} names {candidate!r}, which was NOT read: {reason}",
                    str(candidate),
                )
            )
            continue
        relative = str(candidate)
        listed_paths.add(relative)
        if relative == MANIFEST_FILENAME:
            findings.append(
                Finding(
                    "FILE_SELF_REFERENCE",
                    "BLOCKING",
                    f"files[] lists {MANIFEST_FILENAME} itself. A manifest cannot carry its own "
                    "hash; its integrity is manifest_sha256 plus the detached signature, and the "
                    "builder excludes it by construction",
                    relative,
                )
            )
            continue
        target = bundle_dir / relative
        if target.is_symlink() or (target.exists() and not target.is_file()):
            findings.append(
                Finding(
                    "FILE_NOT_REGULAR",
                    "BLOCKING",
                    f"{relative} is listed but is a symlink or a directory; it was not read",
                    relative,
                )
            )
            continue
        if not target.is_file():
            findings.append(
                Finding(
                    "FILE_LISTED_BUT_ABSENT",
                    "BLOCKING",
                    f"{relative} is listed in files[] but is absent from the bundle",
                    relative,
                )
            )
            continue
        actual_size = target.stat().st_size
        if actual_size != entry.get("byte_size"):
            # Short-circuit: a size mismatch is already proof, and hashing would read a file whose
            # length the manifest got wrong.
            findings.append(
                Finding(
                    "FILE_SIZE_MISMATCH",
                    "BLOCKING",
                    f"{relative} is {actual_size} bytes; files[] records "
                    f"{entry.get('byte_size')!r}",
                    relative,
                )
            )
            continue
        actual_hash = file_sha256(target)
        recorded_hash = entry.get("sha256")
        if not isinstance(recorded_hash, str) or not hmac.compare_digest(recorded_hash, actual_hash):
            findings.append(
                Finding(
                    "FILE_HASH_MISMATCH",
                    "BLOCKING",
                    f"{relative} hashes to {actual_hash}; files[] records {recorded_hash!r}",
                    relative,
                )
            )
            continue
        verified[relative] = actual_hash

    for relative in on_disk:
        if relative == MANIFEST_FILENAME or relative in listed_paths:
            continue
        findings.append(
            Finding(
                "BUNDLE_FILE_UNLISTED",
                "BLOCKING",
                f"{relative} is present in the bundle but absent from files[]; PRD §18.4 requires "
                "file hashes for every file in the bundle",
                relative,
            )
        )
    return verified


def _check_artifacts(
    bundle_dir: Path,
    document: Mapping[str, Any],
    listed_hashes: Mapping[str, str],
    findings: list[Finding],
) -> None:
    """Step 6, in BOTH directions: `artifacts.*` must agree with the same file's `files[]` entry."""
    artifacts = document.get("artifacts")
    if not isinstance(artifacts, Mapping):
        return
    files = document.get("files")
    by_path = {
        entry["path"]: entry
        for entry in (files if isinstance(files, list) else [])
        if isinstance(entry, Mapping) and isinstance(entry.get("path"), str)
    }
    for member, filename in (
        ("corpus_sqlite_sha256", _CORPUS_DATABASE),
        ("vector_index_sha256", _VECTOR_INDEX),
        ("embedding_manifest_sha256", _EMBEDDING_MANIFEST),
    ):
        recorded = artifacts.get(member)
        entry = by_path.get(filename)
        if entry is None:
            findings.append(
                Finding(
                    "ARTIFACT_HASH_MISMATCH",
                    "BLOCKING",
                    f"artifacts.{member} has no matching files[] entry for {filename}",
                    f"artifacts.{member}",
                )
            )
            continue
        expected = entry.get("sha256")
        if not isinstance(recorded, str) or not isinstance(expected, str) or not hmac.compare_digest(
            recorded, expected
        ):
            findings.append(
                Finding(
                    "ARTIFACT_HASH_MISMATCH",
                    "BLOCKING",
                    f"artifacts.{member} records {recorded!r} but files[] records {expected!r} for "
                    f"{filename}",
                    f"artifacts.{member}",
                )
            )

    recorded_index = artifacts.get("lexical_index_sha256")
    actual_index = directory_digest(bundle_dir / BUNDLE_LEXICAL_INDEX_DIR, bundle_dir)
    if not isinstance(recorded_index, str) or not hmac.compare_digest(recorded_index, actual_index):
        findings.append(
            Finding(
                "ARTIFACT_HASH_MISMATCH",
                "BLOCKING",
                f"artifacts.lexical_index_sha256 records {recorded_index!r}; the directory digest "
                f"of {BUNDLE_LEXICAL_INDEX_DIR}/ is {actual_index}",
                "artifacts.lexical_index_sha256",
            )
        )
    _ = listed_hashes  # the per-file hashes are already checked in step 5


def _check_corpus_database(
    bundle_dir: Path, document: Mapping[str, Any], findings: list[Finding]
) -> None:
    """Step 7. A tampered database may still open, so this runs whether or not step 5 complained."""
    path = bundle_dir / _CORPUS_DATABASE
    if not path.is_file():
        return  # already reported as BUNDLE_PATH_MISSING; do not restate it as a database defect
    connection = None
    try:
        connection = open_corpus_database(path, read_only=True)
        row = connection.execute("SELECT schema_version FROM corpus_meta").fetchone()
    except (sqlite3.Error, OSError) as error:
        findings.append(
            Finding(
                "CORPUS_DATABASE_UNREADABLE",
                "BLOCKING",
                f"{_CORPUS_DATABASE} could not be read: {type(error).__name__}: {error}",
                _CORPUS_DATABASE,
            )
        )
        return
    finally:
        if connection is not None:
            connection.close()
    if row is None:
        findings.append(
            Finding(
                "CORPUS_DATABASE_UNREADABLE",
                "BLOCKING",
                f"{_CORPUS_DATABASE} carries no corpus_meta row",
                _CORPUS_DATABASE,
            )
        )
        return
    versions = document.get("versions")
    declared = versions.get("schema") if isinstance(versions, Mapping) else None
    if declared != row[0]:
        findings.append(
            Finding(
                "CORPUS_SCHEMA_VERSION_MISMATCH",
                "BLOCKING",
                f"versions.schema is {declared!r} but corpus_meta.schema_version is {row[0]!r}; "
                "PRD §42.1 fails readiness during an incompatible app/corpus/schema state",
                "versions.schema",
            )
        )


def _parse_version(value: str) -> tuple[int, ...] | None:
    parts = value.split(".")
    if not parts or not all(part.isdigit() for part in parts):
        return None
    return tuple(int(part) for part in parts)


def _check_compatibility(
    document: Mapping[str, Any], expected: Compatibility | None, findings: list[Finding]
) -> None:
    """Step 8. Compared ONLY where *expected* supplies the member."""
    if expected is None:
        return
    compatibility = document.get("compatibility")
    if not isinstance(compatibility, Mapping):
        return
    for member, consumer_version in (
        ("app", expected.app_version),
        ("search", expected.search_version),
    ):
        if consumer_version is None:
            continue
        window = compatibility.get(member)
        if not isinstance(window, Mapping):
            continue
        actual = _parse_version(consumer_version)
        low = _parse_version(str(window.get("min")))
        high_raw = window.get("max")
        high = None if high_raw is None else _parse_version(str(high_raw))
        if actual is None or low is None or (high_raw is not None and high is None):
            findings.append(
                Finding(
                    "COMPATIBILITY_VERSION_UNPARSEABLE",
                    "BLOCKING",
                    f"compatibility.{member} compares {consumer_version!r} against "
                    f"[{window.get('min')!r}, {high_raw!r}] and at least one is not a numeric "
                    "dotted version; an unparseable bound is never a silent pass",
                    f"compatibility.{member}",
                )
            )
            continue
        if actual < low or (high is not None and actual > high):
            findings.append(
                Finding(
                    "COMPATIBILITY_OUT_OF_RANGE",
                    "BLOCKING",
                    f"consumer {member} version {consumer_version} is outside the release's "
                    f"supported range [{window.get('min')}, {high_raw}]",
                    f"compatibility.{member}",
                )
            )

    if expected.corpus_schema is not None:
        declared = compatibility.get("corpus_schema")
        if declared != expected.corpus_schema:
            findings.append(
                Finding(
                    "COMPATIBILITY_OUT_OF_RANGE",
                    "BLOCKING",
                    f"the release requires corpus schema {declared!r}; the consumer implements "
                    f"{expected.corpus_schema!r}",
                    "compatibility.corpus_schema",
                )
            )


# ==================================================================================================
# Step 9 — pinning (deliverable 13)
# ==================================================================================================

#: `DOCUMENT_EMBEDDING` pin member -> embedding-manifest member. Each mismatch is its own finding so
#: a test can vary exactly one.
_DOCUMENT_PIN_AGREEMENT: tuple[tuple[str, str], ...] = (
    ("model_id", "model_id"),
    ("model_revision", "model_revision"),
    ("dimensions", "dimensions"),
    ("normalisation", "normalisation"),
)

#: `QUERY_EMBEDDING` representation members that must equal `DOCUMENT_EMBEDDING`'s: a query vector
#: that cannot match the indexed vectors is a release defect, not a runtime surprise (PRD §14.4).
_QUERY_REPRESENTATION_MEMBERS: tuple[str, ...] = (
    "dimensions",
    "normalisation",
    "truncation",
    "max_tokens",
)


def _load_embedding_manifest(
    bundle_dir: Path, findings: list[Finding]
) -> Mapping[str, Any] | None:
    path = bundle_dir / _EMBEDDING_MANIFEST
    if not path.is_file():
        findings.append(
            Finding(
                "EMBEDDING_MANIFEST_ABSENT",
                "BLOCKING",
                f"{_EMBEDDING_MANIFEST} is absent, so the DOCUMENT_EMBEDDING pin cannot be checked "
                "against it",
                _EMBEDDING_MANIFEST,
            )
        )
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        findings.append(
            Finding(
                "EMBEDDING_MANIFEST_UNPARSEABLE",
                "BLOCKING",
                f"{_EMBEDDING_MANIFEST} is not parseable JSON: {error}",
                _EMBEDDING_MANIFEST,
            )
        )
        return None
    if not isinstance(document, dict):
        findings.append(
            Finding(
                "EMBEDDING_MANIFEST_UNPARSEABLE",
                "BLOCKING",
                f"{_EMBEDDING_MANIFEST} does not contain a JSON object",
                _EMBEDDING_MANIFEST,
            )
        )
        return None
    _validate_against_schema(
        document,
        EMBEDDING_SCHEMA_ID,
        _EMBEDDING_MANIFEST,
        "EMBEDDING_MANIFEST_SCHEMA_INVALID",
        findings,
    )
    return document


def _disagreement(subject: str, member: str, pinned: Any, other: Any) -> Finding:
    return Finding(
        "PIN_EMBEDDING_MANIFEST_DISAGREEMENT",
        "BLOCKING",
        f"{subject} pins {member}={pinned!r} but {_EMBEDDING_MANIFEST} records {other!r}; a "
        "consumer cannot tell which produced the indexed vectors",
        f"{subject}.{member}",
    )


def _check_pins(
    bundle_dir: Path,
    document: Mapping[str, Any],
    release_kind: str | None,
    findings: list[Finding],
) -> None:
    stub_severity = "INFO" if release_kind == "SYNTHETIC_FIXTURE" else "BLOCKING"

    runtime = document.get("runtime")
    if not isinstance(runtime, Mapping):
        findings.append(
            Finding(
                "PIN_RUNTIME_ABSENT",
                "BLOCKING",
                "the manifest pins no runtime; breakdown plan §8 Q11 requires the release to record "
                "the runtime family, version, execution providers and crate pins",
                "runtime",
            )
        )
    elif is_stub(runtime.get("family")):
        findings.append(
            Finding(
                "PIN_STUB",
                stub_severity,
                f"runtime.family is the stub marker {runtime.get('family')!r}",
                "runtime.family",
            )
        )

    models = document.get("local_models")
    models = models if isinstance(models, list) else []
    by_role: dict[str, Mapping[str, Any]] = {
        pin["role"]: pin
        for pin in models
        if isinstance(pin, Mapping) and isinstance(pin.get("role"), str)
    }
    if "DOCUMENT_EMBEDDING" not in by_role:
        findings.append(
            Finding(
                "PIN_MODEL_ROLE_ABSENT",
                "BLOCKING",
                "local_models pins no DOCUMENT_EMBEDDING role; the release cannot say what produced "
                "its indexed vectors",
                "local_models",
            )
        )

    required_members = (
        "role",
        "model_id",
        "model_revision",
        "model_artifact",
        "dimensions",
        "normalisation",
        "truncation",
        "max_tokens",
        "tokenizer",
        "licence",
        "bundle_path",
    )
    for role, pin in sorted(by_role.items()):
        for member in required_members:
            if member not in pin:
                findings.append(
                    Finding(
                        "PIN_MEMBER_ABSENT",
                        "BLOCKING",
                        f"the {role} pin has no {member}; breakdown plan §8 Q11 makes every member "
                        "of the pin required",
                        f"local_models[{role}].{member}",
                    )
                )
        if is_stub(pin.get("model_id")):
            findings.append(
                Finding(
                    "PIN_STUB",
                    stub_severity,
                    f"the {role} pin's model_id is the stub marker {pin.get('model_id')!r}",
                    f"local_models[{role}].model_id",
                )
            )
        tokenizer = pin.get("tokenizer")
        if isinstance(tokenizer, Mapping):
            for pin_member, tokenizer_member in (("truncation", "truncation"), ("max_tokens", "max_tokens")):
                if pin.get(pin_member) != tokenizer.get(tokenizer_member):
                    findings.append(
                        Finding(
                            "PIN_TOKENIZER_INCONSISTENT",
                            "BLOCKING",
                            f"the {role} pin records {pin_member}={pin.get(pin_member)!r} but its "
                            f"tokenizer records {tokenizer.get(tokenizer_member)!r}; the pin "
                            "contradicts itself",
                            f"local_models[{role}].{pin_member}",
                        )
                    )

    profile = document.get("embedding_profile")
    if isinstance(profile, Mapping) and is_stub(profile.get("model_id")):
        findings.append(
            Finding(
                "PIN_STUB",
                stub_severity,
                f"embedding_profile.model_id is the stub marker {profile.get('model_id')!r}",
                "embedding_profile.model_id",
            )
        )

    embedding = _load_embedding_manifest(bundle_dir, findings)
    if embedding is None:
        return
    if is_stub(embedding.get("model_id")):
        findings.append(
            Finding(
                "PIN_STUB",
                stub_severity,
                f"{_EMBEDDING_MANIFEST} records the stub model_id {embedding.get('model_id')!r}",
                f"{_EMBEDDING_MANIFEST}.model_id",
            )
        )
    embedding_runtime = embedding.get("runtime")
    if isinstance(embedding_runtime, Mapping) and is_stub(embedding_runtime.get("family")):
        findings.append(
            Finding(
                "PIN_STUB",
                stub_severity,
                f"{_EMBEDDING_MANIFEST} records the stub runtime.family "
                f"{embedding_runtime.get('family')!r}",
                f"{_EMBEDDING_MANIFEST}.runtime.family",
            )
        )

    document_pin = by_role.get("DOCUMENT_EMBEDDING")
    if document_pin is not None:
        for pin_member, embedding_member in _DOCUMENT_PIN_AGREEMENT:
            if document_pin.get(pin_member) != embedding.get(embedding_member):
                findings.append(
                    _disagreement(
                        "DOCUMENT_EMBEDDING", pin_member, document_pin.get(pin_member),
                        embedding.get(embedding_member),
                    )
                )
        for group, members in (
            ("model_artifact", ("sha256", "byte_size", "format")),
            ("tokenizer", ("id", "artifact_sha256", "max_tokens", "truncation")),
            ("licence", ("identifier", "url", "attribution_required", "redistribution_permitted", "notes")),
        ):
            pinned_group = document_pin.get(group)
            other_group = embedding.get(group)
            if not isinstance(pinned_group, Mapping) or not isinstance(other_group, Mapping):
                continue
            for member in members:
                if pinned_group.get(member) != other_group.get(member):
                    findings.append(
                        _disagreement(
                            "DOCUMENT_EMBEDDING",
                            f"{group}.{member}",
                            pinned_group.get(member),
                            other_group.get(member),
                        )
                    )
        if isinstance(runtime, Mapping) and isinstance(embedding_runtime, Mapping):
            for member in (
                "family",
                "version",
                "execution_providers",
                "integration",
                "tokenizer_library",
                "pinned_by",
            ):
                if runtime.get(member) != embedding_runtime.get(member):
                    findings.append(
                        _disagreement("runtime", member, runtime.get(member), embedding_runtime.get(member))
                    )

    if isinstance(profile, Mapping):
        for profile_member, embedding_member in (
            ("profile_id", "profile_id"),
            ("model_id", "model_id"),
            ("dimensions", "dimensions"),
            ("quantisation", "quantisation"),
        ):
            if profile.get(profile_member) != embedding.get(embedding_member):
                findings.append(
                    _disagreement(
                        "embedding_profile", profile_member, profile.get(profile_member),
                        embedding.get(embedding_member),
                    )
                )

    query_pin = by_role.get("QUERY_EMBEDDING")
    if query_pin is not None and document_pin is not None:
        for member in _QUERY_REPRESENTATION_MEMBERS:
            if query_pin.get(member) != document_pin.get(member):
                findings.append(
                    Finding(
                        "PIN_QUERY_REPRESENTATION_DISAGREEMENT",
                        "BLOCKING",
                        f"the QUERY_EMBEDDING pin records {member}={query_pin.get(member)!r} but "
                        f"DOCUMENT_EMBEDDING records {document_pin.get(member)!r}; a query vector "
                        "that cannot match the indexed vectors is a release defect",
                        f"local_models[QUERY_EMBEDDING].{member}",
                    )
                )
        query_tokenizer = query_pin.get("tokenizer")
        document_tokenizer = document_pin.get("tokenizer")
        if isinstance(query_tokenizer, Mapping) and isinstance(document_tokenizer, Mapping):
            for member in ("id", "artifact_sha256"):
                if query_tokenizer.get(member) != document_tokenizer.get(member):
                    findings.append(
                        Finding(
                            "PIN_QUERY_REPRESENTATION_DISAGREEMENT",
                            "BLOCKING",
                            f"the QUERY_EMBEDDING pin's tokenizer.{member} is "
                            f"{query_tokenizer.get(member)!r} but DOCUMENT_EMBEDDING's is "
                            f"{document_tokenizer.get(member)!r}",
                            f"local_models[QUERY_EMBEDDING].tokenizer.{member}",
                        )
                    )


# ==================================================================================================
# Entry point
# ==================================================================================================


def verify_bundle(
    bundle_dir: Path,
    *,
    public_keys: Mapping[str, bytes],
    expected: Compatibility | None = None,
) -> VerificationReport:
    """Run deliverable 10's nine steps IN ORDER and collect EVERY finding.

    A step is skipped only when its input is unavailable, and the skip is itself a finding stating
    why — an operator must never have to infer that a check did not run.
    """
    findings: list[Finding] = []
    document = _load_manifest(Path(bundle_dir), findings)
    if document is None:
        return VerificationReport(tuple(findings), None, None)

    raw_kind = document.get("release_kind")
    release_kind = raw_kind if isinstance(raw_kind, str) else None
    if release_kind == "SYNTHETIC_FIXTURE":
        findings.append(
            Finding(
                "RELEASE_KIND_SYNTHETIC_FIXTURE",
                "INFO",
                "this is a SYNTHETIC_FIXTURE release: generated test data, never promotable. "
                "Promotion tooling (RLSE-07) refuses it on this finding alone.",
                "release_kind",
            )
        )

    bundle_dir = Path(bundle_dir)
    _validate_against_schema(
        document, RELEASE_SCHEMA_ID, MANIFEST_FILENAME, "MANIFEST_SCHEMA_INVALID", findings
    )
    _check_digest(document, findings)
    findings.extend(
        verify_signature(document, public_keys=public_keys, release_kind=release_kind)
    )
    verified = _check_layout_and_files(bundle_dir, document, findings)
    _check_artifacts(bundle_dir, document, verified, findings)
    _check_corpus_database(bundle_dir, document, findings)
    _check_compatibility(document, expected, findings)
    _check_pins(bundle_dir, document, release_kind, findings)

    return VerificationReport(tuple(findings), release_kind, document)
