"""`validate_record()` — JSON-Schema validation plus the CRPS-01 cross-field rules.

It NEVER raises on invalid data. Every failure, including an unexpected internal one, comes back as
a `ContractViolation`; a validator that throws on bad input is useless to a quarantine pipeline that
exists precisely to handle bad input (PRD §40.7).

Checks run in a fixed order and the specific ones short-circuit, so an invalid record produces the
ONE code that names its actual defect rather than a spray of derived schema errors. That is what
makes `tests/contracts/fixtures/invalid/**` a meaningful contract for `INGF-01` and the five source
modules to assert against.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from functools import lru_cache
from typing import Any, Iterable, Mapping

from .paths import INTERMEDIATE_SCHEMA_DIR
from .records import RECORD_TYPES
from .version import CONTRACT_VERSION, major_of
from .violations import ContractViolation

__all__ = [
    "CORPUS_ID_PATTERN",
    "envelope_validator",
    "jsonschema_engine",
    "node_ref_key",
    "sha256_hex",
    "validate_record",
]

#: The FND-03 opaque-ID form: a short lower-case resource prefix and a UUIDv7.
CORPUS_ID_PATTERN = re.compile(
    r"^[a-z]{2,8}_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)

_PROVENANCE_MEMBERS = ("official_url", "artifact_sha256", "retrieved_at")


def sha256_hex(text: str) -> str:
    """Lowercase hex SHA-256 of the UTF-8 bytes of *text* — the contract's `text_hash` rule."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def node_ref_key(ref: Mapping[str, Any]) -> tuple[str, str, str]:
    """The hashable identity of a `NodeRef`, for cross-record lookups within one run."""
    return (
        str(ref.get("stable_source_key", "")),
        str(ref.get("version_label", "")),
        str(ref.get("stable_node_key", "")),
    )


@lru_cache(maxsize=1)
def _registry() -> Any:
    """A `referencing` registry pre-loaded from disk.

    Every schema is registered under its own `$id`, so all `$ref`s resolve locally: this validator
    never opens a socket, which is a hard requirement for an offline build (PRD §45.3).

    The JSON-Schema library is imported HERE, not at module import time, so that the corpus-schema
    half of this package (`contracts.schema`, `contracts.enums`) stays usable with the standard
    library alone. A DDL consumer should not need a JSON-Schema library.
    """
    from referencing import Registry, Resource

    registry = Registry()
    for path in sorted(INTERMEDIATE_SCHEMA_DIR.glob("*.schema.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        registry = registry.with_resource(document["$id"], Resource.from_contents(document))
    return registry


def jsonschema_engine() -> str:
    """`"jsonschema"` when the third-party library is importable, else `"jsonschema_min"`.

    Which engine is in use is reportable rather than hidden, because it is the difference between
    the contract being checked by an off-the-shelf library and being checked by the repository's own
    generic subset validator. See `jsonschema_min` for why the fallback has to exist at all (E1: a
    uv workspace member's declared dependency is not installed by the root `uv sync --frozen`).
    """
    try:
        import jsonschema  # noqa: F401
        import referencing  # noqa: F401
    except ImportError:
        return "jsonschema_min"
    return "jsonschema"


@lru_cache(maxsize=1)
def envelope_validator() -> Any:
    """The compiled envelope validator, which dispatches into the nine payload schemas."""
    envelope = json.loads((INTERMEDIATE_SCHEMA_DIR / "envelope.schema.json").read_text("utf-8"))
    if jsonschema_engine() == "jsonschema":
        from jsonschema import Draft202012Validator

        return Draft202012Validator(envelope, registry=_registry())

    from .jsonschema_min import Draft202012Validator as MinValidator
    from .jsonschema_min import load_documents

    documents = load_documents(sorted(INTERMEDIATE_SCHEMA_DIR.glob("*.schema.json")))
    return MinValidator(envelope, documents=documents)


def _pointer(path: Iterable[Any]) -> str:
    parts = [str(part).replace("~", "~0").replace("/", "~1") for part in path]
    return "/" + "/".join(parts) if parts else ""


def _string_leaves(value: Any, pointer: str = "") -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        yield pointer, value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from _string_leaves(item, f"{pointer}/{str(key).replace('~', '~0').replace('/', '~1')}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from _string_leaves(item, f"{pointer}/{index}")


def validate_record(
    obj: Mapping[str, Any],
    *,
    node_texts: Mapping[tuple[str, str, str], str] | None = None,
    record_index: int = -1,
) -> list[ContractViolation]:
    """Return every contract violation in *obj*. An empty list means the record conforms.

    *node_texts* supplies the `canonical_text` of node versions already seen in the same run, which
    is what makes `OFFSET_OUT_OF_RANGE` checkable for a `node_relation`. Absent, the offset range is
    still checked for internal consistency (`OFFSET_RANGE_INVALID`) but not against any text.
    """
    from .jsonschema_min import UnsupportedKeywordError

    try:
        return _validate(obj, node_texts or {}, record_index)
    except (ImportError, UnsupportedKeywordError):
        # A BROKEN VALIDATION ENVIRONMENT IS NOT A DEFECT IN THE RECORD. Reporting a missing library
        # or a schema keyword the engine cannot enforce as SCHEMA_INVALID would turn "not checked"
        # into "every record is invalid" — or worse, into "valid". Both are exactly the silent
        # degradation this contract exists to prevent, so they stay loud.
        raise
    except Exception as error:  # noqa: BLE001 — a validator must never raise. See module docstring.
        return [
            ContractViolation(
                code="SCHEMA_INVALID",
                message=f"record could not be validated: {type(error).__name__}: {error}",
                record_index=record_index,
            )
        ]


def _validate(
    obj: Mapping[str, Any],
    node_texts: Mapping[tuple[str, str, str], str],
    index: int,
) -> list[ContractViolation]:
    def violation(code: str, message: str, pointer: str = "") -> list[ContractViolation]:
        return [ContractViolation(code=code, message=message, pointer=pointer, record_index=index)]

    # (0) Shape. `None`, a list and a bare string all land here rather than exploding later.
    if not isinstance(obj, Mapping):
        return violation("SCHEMA_INVALID", f"a record must be a JSON object, got {type(obj).__name__}")

    # (1) Contract-version guard (deliverable 16). Checked first: if the reader cannot understand
    # the dialect, every later finding would be noise.
    raw_version = obj.get("contract_version")
    if not isinstance(raw_version, str):
        return violation(
            "CONTRACT_VERSION_UNSUPPORTED",
            f"contract_version must be a semver string, got {raw_version!r}",
            "/contract_version",
        )
    try:
        record_major = major_of(raw_version)
    except ValueError as error:
        return violation("CONTRACT_VERSION_UNSUPPORTED", str(error), "/contract_version")
    current_major = major_of(CONTRACT_VERSION)
    if abs(record_major - current_major) > 1:
        return violation(
            "CONTRACT_VERSION_UNSUPPORTED",
            f"contract_version {raw_version} is more than one major apart from the reader's "
            f"{CONTRACT_VERSION}; a reader accepts the current major and the immediately previous "
            "major only (CRPS-01 deliverable 16)",
            "/contract_version",
        )

    # (2) Record type.
    record_type = obj.get("record_type")
    if not isinstance(record_type, str) or record_type not in RECORD_TYPES:
        return violation(
            "RECORD_TYPE_UNKNOWN",
            f"record_type {record_type!r} is not one of the nine contract record types: "
            f"{', '.join(sorted(RECORD_TYPES))}",
            "/record_type",
        )

    # (3) Provenance (PRD §40.7). Ahead of the schema so the named invalid fixture pairs with a
    # meaningful code instead of a generic one.
    provenance = obj.get("provenance")
    if not isinstance(provenance, Mapping):
        return violation("PROVENANCE_MISSING", "provenance is absent or not an object", "/provenance")
    for member in _PROVENANCE_MEMBERS:
        value = provenance.get(member)
        if not isinstance(value, str) or not value.strip():
            return violation(
                "PROVENANCE_MISSING",
                f"provenance.{member} is absent or empty; PRD §40.7 requires source URL, artifact "
                "hash and retrieval time on every emitted record",
                f"/provenance/{member}",
            )

    payload = obj.get("payload")
    if not isinstance(payload, Mapping):
        return violation("SCHEMA_INVALID", "payload is absent or not an object", "/payload")

    # (4) No corpus primary key anywhere in the payload (deliverable 11). Ahead of the schema
    # because the schema's `not` clause would report it as a generic failure.
    for pointer, text in _string_leaves(payload):
        if CORPUS_ID_PATTERN.match(text):
            return violation(
                "CORPUS_ID_IN_RECORD",
                f"payload carries the corpus primary key {text!r}; a record references other "
                "records by natural key only (PRD §40.7, breakdown plan A4)",
                f"/payload{pointer}",
            )

    # (5) Offset range self-consistency (deliverable 12), ahead of the schema for the same reason.
    findings = _check_offsets(record_type, payload, node_texts, index)
    if findings:
        return findings

    # (6) Text rules (deliverable 12). `text_hash` and NFC are invisible to a JSON Schema.
    findings = _check_text(record_type, payload, index)
    if findings:
        return findings

    # (7) MODEL_SUGGESTED (PRD §35.2).
    findings = _check_confidence(record_type, payload, index)
    if findings:
        return findings

    # (8) The schemas themselves, last: everything above is a more specific diagnosis of a record
    # that would also fail here.
    violations: list[ContractViolation] = []
    seen: set[tuple[str, str]] = set()
    for error in envelope_validator().iter_errors(obj):
        code = "ENUM_UNKNOWN_VALUE" if error.validator in {"enum", "const"} else "SCHEMA_INVALID"
        pointer = _pointer(error.absolute_path)
        if (code, pointer) in seen:
            continue
        seen.add((code, pointer))
        violations.append(
            ContractViolation(code=code, message=error.message, pointer=pointer, record_index=index)
        )
    return violations


def _check_offsets(
    record_type: str,
    payload: Mapping[str, Any],
    node_texts: Mapping[tuple[str, str, str], str],
    index: int,
) -> list[ContractViolation]:
    if record_type != "node_relation":
        return []
    start, end = payload.get("evidence_start"), payload.get("evidence_end")
    if start is None and end is None:
        return []

    def bad(message: str) -> list[ContractViolation]:
        return [
            ContractViolation(
                code="OFFSET_RANGE_INVALID",
                message=message,
                pointer="/payload/evidence_start",
                record_index=index,
            )
        ]

    if start is None or end is None:
        return bad("evidence_start and evidence_end travel together: give both or neither")
    if not isinstance(start, int) or not isinstance(end, int) or isinstance(start, bool) or isinstance(end, bool):
        return bad(f"evidence offsets must be integers, got {start!r} and {end!r}")
    if start < 0 or end < 0:
        return bad(f"evidence offsets must be non-negative, got [{start}, {end})")
    if end < start:
        return bad(f"evidence range [{start}, {end}) is inverted; ranges are half-open [start, end)")

    ref = payload.get("evidence_ref")
    if not isinstance(ref, Mapping):
        return bad("an evidence offset range requires evidence_ref to say what it indexes into")
    text = node_texts.get(node_ref_key(ref))
    if text is None:
        return []  # Not resolvable in this scope; `read_run()` re-checks with the whole run loaded.
    if end > len(text):
        return [
            ContractViolation(
                code="OFFSET_OUT_OF_RANGE",
                message=(
                    f"evidence range [{start}, {end}) overruns the referenced canonical_text, which "
                    f"is {len(text)} CHARACTERS long ({len(text.encode('utf-8'))} UTF-8 bytes). "
                    "Offsets are character offsets, not byte offsets (CRPS-01 deliverable 12)."
                ),
                pointer="/payload/evidence_end",
                record_index=index,
            )
        ]
    return []


def _check_text(record_type: str, payload: Mapping[str, Any], index: int) -> list[ContractViolation]:
    if record_type != "node_version":
        return []
    text = payload.get("canonical_text")
    if not isinstance(text, str):
        return []  # The schema reports the type failure.
    if unicodedata.normalize("NFC", text) != text:
        return [
            ContractViolation(
                code="TEXT_NOT_NFC",
                message=(
                    "canonical_text is not Unicode-NFC-normalised; normalisation happens exactly "
                    "once, at normalise() (CRPS-01 deliverable 12)"
                ),
                pointer="/payload/canonical_text",
                record_index=index,
            )
        ]
    stated = payload.get("text_hash")
    expected = sha256_hex(text)
    if isinstance(stated, str) and stated != expected:
        return [
            ContractViolation(
                code="TEXT_HASH_MISMATCH",
                message=(
                    f"text_hash is {stated!r} but the SHA-256 of the UTF-8 bytes of canonical_text "
                    f"is {expected!r}"
                ),
                pointer="/payload/text_hash",
                record_index=index,
            )
        ]
    return []


def _check_confidence(
    record_type: str, payload: Mapping[str, Any], index: int
) -> list[ContractViolation]:
    """PRD §35.2: *"`MODEL_SUGGESTED` cannot support definitive status."*

    What is enforceable on ONE record is that a model suggestion must be evidenced: it must point at
    the node version and the exact character range it was suggested from, so a gate or a human can
    check it. An unevidenced MODEL_SUGGESTED relation is indistinguishable from a definitive one
    downstream, which is exactly what the PRD forbids.

    The other half — that derived legal status must never rest on a MODEL_SUGGESTED relation — is a
    whole-corpus derivation rule and belongs to CRPS-06's validation gates (PRD §15.2 puts status
    derivation there). It is deliberately NOT faked here.
    """
    if record_type != "node_relation" or payload.get("confidence_state") != "MODEL_SUGGESTED":
        return []
    missing = [
        member
        for member in ("evidence_ref", "evidence_start", "evidence_end")
        if payload.get(member) is None
    ]
    if not missing:
        return []
    return [
        ContractViolation(
            code="MODEL_SUGGESTED_DEFINITIVE",
            message=(
                "a MODEL_SUGGESTED relation must carry "
                f"{', '.join(missing)}: PRD §35.2 says MODEL_SUGGESTED cannot support definitive "
                "status, so an unevidenced model suggestion may not be emitted"
            ),
            pointer="/payload/confidence_state",
            record_index=index,
        )
    ]
