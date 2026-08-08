"""Detached Ed25519 signing and signature verification for the release manifest.

CRPS-02 deliverable 8. The scheme, the canonical bytes it covers and the on-disk key form are
recorded in `docs/adr/0002-corpus-release-signing.md`.

KEY HANDLING (PRD §20.2 — coding agents never receive production signing credentials).

* A private key is loaded from an EXPLICIT PATH, or from the path named by the
  `CORPUS_SIGNING_KEYFILE` environment variable. The variable carries a PATH, never key bytes.
* No key material ever reaches a message, a finding, a log line or an exception. Every error below
  names the file and the defect, never the contents.
* The only key committed to this repository is the development fixture under
  `tests/manifest/fixtures/keys/**`, whose `key_id` starts with `dev-` so a development signature is
  identifiable in any manifest.

ON-DISK FORM. JSON, deliberately, and never PEM:

    {"key_id": "...", "algorithm": "ED25519", "kind": "DEVELOPMENT_ONLY",
     "seed_b64": "<base64 of the 32-byte seed>", "warning": "..."}

and the public counterpart with `public_key_b64`. Two reasons. First, a committed PEM private-key
header is a hard CI failure: `.github/workflows/checks/secret-scan.mjs` scans every git-tracked file
for that header, and its excluded-path list is asserted to hold exactly one entry, so a fixture key
cannot be allow-listed. Second, raw base64 of the 32-byte key is the friendliest form for the Rust
verifier RETR-01 will build. Anything else — including PEM — raises `UnsupportedKeyFormat` naming
sub-PRD open question Q-CRPS-3, because production key custody and format are the Founder's
decision and will plug in here without changing `sign_manifest`'s signature.
"""

from __future__ import annotations

import base64
import binascii
import json
import os
from dataclasses import replace
from pathlib import Path
from typing import Any, Mapping

from contracts.schema import utc_now

from . import ed25519
from .canonical import canonical_bytes, manifest_sha256 as _digest_of
from .findings import Finding
from .model import ReleaseManifest, Signature, SigningKeyError, UnsupportedKeyFormat

__all__ = [
    "ALGORITHM",
    "SIGNING_KEYFILE_ENV",
    "DEVELOPMENT_SIGNER_PREFIX",
    "load_private_key",
    "load_public_key",
    "public_keys_from",
    "sign_manifest",
    "verify_signature",
]

#: The name of the environment variable that holds the PATH of a signing key file. Never key bytes.
SIGNING_KEYFILE_ENV = "CORPUS_SIGNING_KEYFILE"

#: The only scheme this contract accepts today (deliverable 8; ADR 0002).
ALGORITHM = "ED25519"

#: A development key's identity starts with this, so it is visible in any manifest it signed.
DEVELOPMENT_SIGNER_PREFIX = "dev-"

_SEED_BYTES = 32
_PUBLIC_BYTES = 32


def _read_key_document(path: Path) -> Mapping[str, Any]:
    if not path.is_file():
        raise SigningKeyError(f"no signing key file at {path}")
    raw = path.read_bytes()
    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UnsupportedKeyFormat(
            f"{path} is not the JSON key form this module reads ({type(error).__name__}). "
            "Production key custody and on-disk format are sub-PRD open question Q-CRPS-3 and the "
            "Founder's decision; until it is taken only the documented JSON form is accepted."
        ) from None
    if not isinstance(document, dict):
        raise UnsupportedKeyFormat(f"{path} does not contain a JSON object (Q-CRPS-3)")
    algorithm = document.get("algorithm")
    if algorithm != ALGORITHM:
        raise UnsupportedKeyFormat(
            f"{path} declares algorithm {algorithm!r}; this contract signs with {ALGORITHM!r} only "
            "(deliverable 8, ADR 0002). A different scheme is a writeback, not a code change."
        )
    key_id = document.get("key_id")
    if not isinstance(key_id, str) or not key_id:
        raise SigningKeyError(f"{path} carries no key_id")
    return document


def _decode(value: Any, expected: int, path: Path, member: str) -> bytes:
    if not isinstance(value, str):
        raise UnsupportedKeyFormat(f"{path} has no string {member} member (Q-CRPS-3)")
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise UnsupportedKeyFormat(f"{path}: {member} is not valid base64 (Q-CRPS-3)") from None
    if len(raw) != expected:
        # The LENGTH is safe to state; the bytes are not.
        raise SigningKeyError(f"{path}: {member} decodes to {len(raw)} bytes, expected {expected}")
    return raw


def load_private_key(path: Path | None = None) -> tuple[str, bytes]:
    """Return `(key_id, seed)` from *path*, or from the path in `CORPUS_SIGNING_KEYFILE`.

    The environment variable holds a PATH. This module never reads key bytes out of the
    environment, and the returned seed is never logged, formatted or included in an error.
    """
    if path is None:
        from_environment = os.environ.get(SIGNING_KEYFILE_ENV)
        if not from_environment:
            raise SigningKeyError(
                "no signing key path given and "
                f"{SIGNING_KEYFILE_ENV} is unset; it must name a FILE PATH (never key material)"
            )
        path = Path(from_environment)
    document = _read_key_document(path)
    return str(document["key_id"]), _decode(document.get("seed_b64"), _SEED_BYTES, path, "seed_b64")


def load_public_key(path: Path) -> tuple[str, bytes]:
    """Return `(key_id, public_key)` from a public key file in the documented JSON form."""
    document = _read_key_document(path)
    return (
        str(document["key_id"]),
        _decode(document.get("public_key_b64"), _PUBLIC_BYTES, path, "public_key_b64"),
    )


def public_keys_from(*paths: Path) -> dict[str, bytes]:
    """Build the `{key_id: public_key}` mapping `verify_signature` and `verify_bundle` take."""
    trusted: dict[str, bytes] = {}
    for path in paths:
        key_id, public_key = load_public_key(path)
        if key_id in trusted and trusted[key_id] != public_key:
            raise SigningKeyError(f"two different public keys claim key_id {key_id!r}")
        trusted[key_id] = public_key
    return trusted


def sign_manifest(
    manifest: ReleaseManifest,
    *,
    private_key_path: Path,
    key_id: str,
) -> ReleaseManifest:
    """Return a copy of *manifest* carrying a detached signature over its canonical bytes.

    Enforces the deliverable 6 ordering constraint: the manifest's recorded `manifest_sha256` must
    already equal the digest of its own canonical form (build -> canonicalise -> hash -> sign). A
    manifest whose hash does not match has been mutated after hashing, and signing it would attest
    to bytes nobody checked.
    """
    file_key_id, seed = load_private_key(private_key_path)
    if file_key_id != key_id:
        raise SigningKeyError(
            f"{private_key_path} carries key_id {file_key_id!r}, but the caller asked to sign as "
            f"{key_id!r}; a signature must state the key that actually produced it"
        )
    if manifest.signature is not None:
        raise SigningKeyError(
            f"release {manifest.release_id} is already signed; PRD §35.3 makes a release immutable "
            "after signing, so re-signing is a new release, not an edit"
        )
    payload = manifest.to_dict()
    recomputed = _digest_of(payload)
    if manifest.manifest_sha256 != recomputed:
        raise SigningKeyError(
            f"release {manifest.release_id} records manifest_sha256 {manifest.manifest_sha256!r} "
            f"but its canonical form digests to {recomputed!r} — it was mutated after hashing"
        )
    value = base64.b64encode(ed25519.sign(seed, canonical_bytes(payload))).decode("ascii")
    return replace(
        manifest,
        signature=Signature(algorithm=ALGORITHM, key_id=key_id, value=value, signed_at=utc_now()),
    )


def verify_signature(
    manifest: Mapping[str, Any],
    *,
    public_keys: Mapping[str, bytes],
    release_kind: str | None = None,
) -> list[Finding]:
    """Check the detached signature on a manifest DICT, returning findings.

    The codes are deliberately distinct (acceptance item 5): "I do not know this signer" and "this
    signature does not verify under a signer I know" call for different operator responses, and
    collapsing them would hide a key-distribution problem behind a tampering alarm.
    """
    findings: list[Finding] = []
    signature = manifest.get("signature")
    if signature is None:
        findings.append(
            Finding(
                "SIGNATURE_ABSENT",
                "BLOCKING",
                "the manifest carries no signature; PRD §18.4 requires production to verify one "
                "before the bundle is trusted",
                "signature",
            )
        )
        return findings
    if not isinstance(signature, Mapping):
        findings.append(
            Finding("SIGNATURE_ABSENT", "BLOCKING", "the signature member is not an object", "signature")
        )
        return findings

    algorithm = signature.get("algorithm")
    if algorithm != ALGORITHM:
        findings.append(
            Finding(
                "SIGNATURE_ALGORITHM_UNSUPPORTED",
                "BLOCKING",
                f"signature algorithm {algorithm!r} is not supported; this contract verifies "
                f"{ALGORITHM!r} (ADR 0002)",
                "signature.algorithm",
            )
        )
        return findings

    key_id = signature.get("key_id")
    if not isinstance(key_id, str) or key_id not in public_keys:
        findings.append(
            Finding(
                "SIGNATURE_SIGNER_UNKNOWN",
                "BLOCKING",
                f"the manifest was signed as {key_id!r}, which is not among the signers this "
                "verifier trusts — distinct from a signature that fails to verify",
                "signature.key_id",
            )
        )
        return findings

    raw = signature.get("value")
    decoded: bytes | None = None
    if isinstance(raw, str):
        try:
            decoded = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            decoded = None
    if decoded is None or not ed25519.verify(
        public_keys[key_id], canonical_bytes(manifest), decoded
    ):
        findings.append(
            Finding(
                "SIGNATURE_INVALID",
                "BLOCKING",
                f"the signature does not verify under trusted signer {key_id!r}; the manifest has "
                "been altered since it was signed",
                "signature.value",
            )
        )
        return findings

    if key_id.startswith(DEVELOPMENT_SIGNER_PREFIX):
        development = release_kind != "SYNTHETIC_FIXTURE"
        findings.append(
            Finding(
                "SIGNATURE_SIGNER_DEVELOPMENT",
                "WARNING" if development else "INFO",
                f"signed by development signer {key_id!r}; a production release must not be. "
                "Refusing it is the promotion tool's call (RLSE-07); this only makes it visible.",
                "signature.key_id",
            )
        )
    return findings
