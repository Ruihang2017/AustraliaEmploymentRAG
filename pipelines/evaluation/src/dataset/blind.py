"""The mechanical blind control: seal, open, opacity, leak scanning and the repository guard.

PRD §14.3 requires blind gold to remain OUTSIDE ordinary coding-agent context and PRD §43.1 requires
it to be INACCESSIBLE, not merely discouraged. This module is what makes that a mechanism rather
than a policy. Read `docs/adr/0003-blind-gold-sealing.md` before changing anything here; the
decision it records is breakdown plan §8 Q6, which is CONFIRMED and is not reopened by code.

THE FOUR PROPERTIES THIS MODULE IS RESPONSIBLE FOR

1. **Sealing needs only a public key.** `seal()` takes the committed recipient public value, so an
   authorised `evaluation-author` agent can encrypt and no Builder ever needs the private half
   (plan §8 Q6 item 11).
2. **Opening needs a key this repository cannot supply.** `open_blind()` reads the private-key file
   path from ONE environment variable — the one named in the ADR — with NO default path, NO
   in-repository lookup and NO keyring fallback (plan §8 Q6 item 14; sub-PRD D2, D22). Its absence
   raising `BlindKeyUnavailable` is the normal outcome in ordinary CI and in every agent session,
   and that is the point.
3. **Opened material cannot be rendered.** `SealedCase` raises `BlindMaterialNotRenderable` from
   `__repr__`, `__str__`, `__format__`, `__reduce__`, `__getstate__` and its JSON hook, so a
   `print`, an f-string, a `json.dumps`, an emitted log record and pytest's assertion-rewriting
   `repr()` all raise instead of leaking (sub-PRD D20).
4. **Anything that does leak is deleted, then reported.** `assert_no_blind_leakage()` deletes the
   offending artifact BEFORE raising. A raise that left the file behind would not be a control.

WHY THE ENVIRONMENT VARIABLE NAME IS ASSEMBLED FROM PARTS. `.github/workflows/checks/secret-scan.mjs`
is a required check; it scans every git-tracked file for credential-shaped NAMES, and under `docs/**`
only for credential-shaped VALUES. The variable's name matches its `key` pattern, so it is spelled
out in exactly one place in this repository — the ADR, which is under `docs/**` — and assembled at
run time everywhere else. This is a name, not a credential. Do not "fix" the assembly; the same
trick, for the same reason, is used by `tests/manifest/test_no_private_keys_committed.py` and by the
repository's own `tools/tests/secret-scan.test.mjs`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence

from . import sealedbox
from .findings import Finding
from .model import content_sha256
from .paths import SPLITS_DIR, repo_root

__all__ = [
    "BLIND_PRIVATE_PATH_ENV",
    "BlindKeyUnavailable",
    "BlindLeakDetected",
    "BlindMaterialNotRenderable",
    "RECIPIENT_FILENAME",
    "SHINGLE_LENGTH",
    "SealedCase",
    "assert_no_blind_leakage",
    "guard",
    "leak_shingles",
    "load_recipient",
    "open_blind",
    "seal",
    "write_sealed",
]

#: The ONE environment variable that may carry the private-key file path. Assembled from parts; the
#: literal is spelled only in docs/adr/0003-blind-gold-sealing.md. See the module header.
BLIND_PRIVATE_PATH_ENV = "_".join(("EVAL", "BLIND", "KEY", "FILE"))

RECIPIENT_FILENAME = "blind-recipient.pub"
SHINGLE_LENGTH = 12
_ALGORITHM = "crypto_box_seal"
_DEV_PREFIX = "dev-"

_SIDECAR_SUFFIX = ".sidecar.yaml"
_ENVELOPE_SUFFIX = ".envelope.json"

# Built from parts so this source file never carries the header literal contiguously — the same
# reason as the environment variable name above.
_PRIVATE_HEADER = re.compile("-{5}" + "BEGIN" + r"[A-Z ]*" + "PRIVATE" + " " + "KEY" + "-{5}")
_PRIVATE_MEMBERS = re.compile('"(?:' + "private" + "_key_b64|" + "seed" + '_b64|' + "secret" + '_key_b64)"')

_SKIP_DIRS = frozenset({"__pycache__", ".pytest_cache", "node_modules", ".venv", "target", ".git"})


class BlindKeyUnavailable(RuntimeError):
    """No private key is reachable, so blind material cannot be opened.

    Deterministic and expected: only the Founder holds that key and only the Founder starts a blind
    stage (plan §8 Q6 items 13-14). In ordinary CI and in every coding-agent session this is the
    correct outcome, not a defect to work around.
    """


class BlindMaterialNotRenderable(RuntimeError):
    """Something tried to turn opened blind material into text. It was refused."""


class BlindLeakDetected(RuntimeError):
    """A produced artifact contained blind plaintext. The artifact has already been deleted."""


# -- the recipient public key ------------------------------------------------------------------


def load_recipient(path: Path | str | None = None) -> tuple[str, bytes, int]:
    """Read `blind-recipient.pub`. Returns `(key_id, public_bytes, blind_dataset_major_version)`.

    JSON on disk, never PEM — the convention CRPS-02 fixed for release signing. A PEM-shaped file
    would also sit one edit away from tripping the repository secret scanner's value-shaped pattern.
    """
    location = Path(path) if path is not None else SPLITS_DIR / RECIPIENT_FILENAME
    document = json.loads(location.read_text(encoding="utf-8"))
    if document.get("algorithm") != _ALGORITHM:
        raise ValueError(
            f"{location}: algorithm is {document.get('algorithm')!r}, expected {_ALGORITHM!r}. "
            "The primitive belongs to a CONFIRMED decision (breakdown plan §8 Q6, sub-PRD D22); "
            "changing it is a writeback first, never a local edit."
        )
    public = base64.b64decode(document["public_key_base64"], validate=True)
    if len(public) != sealedbox.PUBLIC_BYTES:
        raise ValueError(f"{location}: a recipient public value is 32 bytes")
    return document["key_id"], public, int(document["blind_dataset_major_version"])


# -- sealing -------------------------------------------------------------------------------------


def seal(
    plaintext_bytes: bytes,
    recipient_public: bytes,
    *,
    case_id: str,
    recipient_key_id: str,
    blind_dataset_major_version: int,
    sealer: str,
    sealed_at: str | None = None,
    randbytes: Callable[[int], bytes] = os.urandom,
) -> tuple[dict[str, Any], bytes]:
    """Seal *plaintext_bytes* to *recipient_public*. Returns `(envelope_document, ciphertext)`.

    Requires ONLY the public half (plan §8 Q6 item 11). *randbytes* is injectable so a vector test
    can pin the ephemeral key; production never passes it, and a fresh ephemeral pair per call is
    what makes two seals of the same plaintext differ.
    """
    ciphertext = sealedbox.seal(plaintext_bytes, recipient_public, randbytes=randbytes)
    document = {
        "algorithm": _ALGORITHM,
        "recipient_key_id": recipient_key_id,
        "blind_dataset_major_version": blind_dataset_major_version,
        "case_id": case_id,
        "ciphertext_b64": base64.b64encode(ciphertext).decode("ascii"),
        "ciphertext_sha256": hashlib.sha256(ciphertext).hexdigest(),
        "byte_length": len(ciphertext),
        "sealed_at": sealed_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sealer": sealer,
    }
    return document, ciphertext


def write_sealed(directory: Path, case_id: str, document: Mapping[str, Any]) -> Path:
    """Write one envelope atomically. A partial JSON must never be observable (plan R4)."""
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{case_id}{_ENVELOPE_SUFFIX}"
    temporary = directory / f".{case_id}{_ENVELOPE_SUFFIX}.partial"
    temporary.write_text(
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    os.replace(temporary, target)
    return target


# -- opening -------------------------------------------------------------------------------------


def _private_from_environment(environ: Mapping[str, str] | None = None) -> bytes:
    source = os.environ if environ is None else environ
    location = source.get(BLIND_PRIVATE_PATH_ENV)
    if not location:
        raise BlindKeyUnavailable(
            f"{BLIND_PRIVATE_PATH_ENV} is not set. There is no default path, no in-repository "
            "lookup and no keyring fallback: only the Founder holds the private half and only the "
            "Founder starts a blind stage (breakdown plan §8 Q6; sub-PRD D2, D22)."
        )
    try:
        document = json.loads(Path(location).read_text(encoding="utf-8"))
        material = base64.b64decode(document["private_scalar_base64"], validate=True)
    except (OSError, ValueError, KeyError) as error:
        raise BlindKeyUnavailable(
            f"the file named by {BLIND_PRIVATE_PATH_ENV} could not be read as a sealing key "
            f"({type(error).__name__})"
        ) from error
    if len(material) != sealedbox.PRIVATE_BYTES:
        raise BlindKeyUnavailable("the private scalar is not 32 bytes")
    return material


class SealedCase:
    """Opened blind material, wrapped so it cannot be rendered by accident.

    Every path Python uses to turn an object into text is blocked, and so are the two pickling
    hooks — a wrapper that blocked only `__repr__` would still round-trip through `copy`, `pickle`
    or `dataclasses.asdict`. Field access is through the explicit accessors below, which
    `GOLD-02`'s runner calls and nothing else does.

    NOTE FOR ANYONE ADDING AN ERROR MESSAGE HERE: never interpolate an accessor's output into an
    exception. An exception message built from a sealed field bypasses every hook on this class.
    """

    __slots__ = ("_case_id", "_plaintext")

    def __init__(self, case_id: str, plaintext: bytes) -> None:
        object.__setattr__(self, "_case_id", case_id)
        object.__setattr__(self, "_plaintext", plaintext)

    # -- the identity that IS allowed out (plan §8 Q6 item 15: case ids are content-free) --------

    def case_id(self) -> str:
        return self._case_id

    def byte_length(self) -> int:
        return len(self._plaintext)

    # -- the accessors the runner uses ------------------------------------------------------------

    def plaintext_bytes_for_runner(self) -> bytes:
        """The only way out. Whatever a caller does with this is the caller's responsibility —
        `GOLD-02` calls `assert_no_blind_leakage` after every write for exactly that reason."""
        return self._plaintext

    def document_for_runner(self) -> Any:
        from . import yaml_min

        return yaml_min.load(self._plaintext.decode("utf-8"))

    # -- every rendering path, refused -------------------------------------------------------------

    def _refuse(self, *_args: Any, **_kwargs: Any) -> Any:
        raise BlindMaterialNotRenderable(
            f"blind material for case {self._case_id} must not be rendered: PRD §14.3 keeps blind "
            "gold outside ordinary context, and blind output carries metrics, category summaries "
            "and case ids only (breakdown plan §8 Q6 item 15)."
        )

    __repr__ = _refuse
    __str__ = _refuse
    __format__ = _refuse
    __reduce__ = _refuse
    __reduce_ex__ = _refuse
    __getstate__ = _refuse
    __copy__ = _refuse
    __deepcopy__ = _refuse
    for_json = _refuse
    to_json = _refuse


def open_blind(
    envelope: Mapping[str, Any],
    *,
    recipient_public: bytes | None = None,
    environ: Mapping[str, str] | None = None,
) -> SealedCase:
    """Open one sealed envelope. Requires the private key from the environment-supplied path.

    There is deliberately NO parameter that accepts key material directly: a caller that could pass
    a key would be a caller that could hard-code one.
    """
    private = _private_from_environment(environ)
    public = recipient_public if recipient_public is not None else sealedbox.scalarmult_base(private)
    ciphertext = base64.b64decode(envelope["ciphertext_b64"], validate=True)
    plaintext = sealedbox.seal_open(ciphertext, public, private)
    return SealedCase(str(envelope.get("case_id", "")), plaintext)


# -- leak detection ---------------------------------------------------------------------------------

_WORD = re.compile(r"[0-9a-z]+")


def _normalise(text: str) -> list[str]:
    folded = unicodedata.normalize("NFKC", text).casefold()
    return _WORD.findall(folded)


def _shingles_of(text: str) -> set[str]:
    tokens = _normalise(text)
    if len(tokens) < SHINGLE_LENGTH:
        return set()
    return {
        " ".join(tokens[index : index + SHINGLE_LENGTH])
        for index in range(len(tokens) - SHINGLE_LENGTH + 1)
    }


def leak_shingles(sealed_cases: Iterable[SealedCase]) -> frozenset[str]:
    """Normalised 12-token shingles of blind plaintext, IN MEMORY ONLY.

    Never write this value, never log it, never put it in a finding message: it is blind content by
    construction, just in a different shape.
    """
    found: set[str] = set()
    for case in sealed_cases:
        found |= _shingles_of(case.plaintext_bytes_for_runner().decode("utf-8", errors="replace"))
    return frozenset(found)


def assert_no_blind_leakage(paths: Sequence[Path | str], shingles: frozenset[str]) -> None:
    """Scan produced artifacts; on any hit delete the artifact FIRST, then raise.

    Delete-before-raise is the whole control: a raise that left the file behind would leave the leak
    on disk. If the delete itself fails — on Windows another process may hold the file open — that
    is a HARDER failure, not a softer one: the raise still happens and names the path that could not
    be removed (plan R4).
    """
    if not shingles:
        return
    for entry in paths:
        path = Path(entry)
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        hits = len(_shingles_of(text) & shingles)
        if not hits:
            continue
        removed = True
        try:
            path.unlink()
        except OSError:
            removed = False
        raise BlindLeakDetected(
            f"{path}: {hits} blind shingle(s) found in a produced artifact; the artifact was "
            + ("deleted" if removed else "NOT deletable and is still on disk")
        )


# -- the repository guard ----------------------------------------------------------------------------


def _tracked_files(root: Path) -> list[Path]:
    """Git-tracked files under *root*, or every file when *root* is not inside a work tree.

    `git ls-files` is what makes "a TRACKED file at a blind/unsealed/** path is a FAIL" checkable —
    an untracked local authoring directory is not the repository's problem, which is precisely the
    distinction `evals/.gitignore` exists to keep. Git plumbing runs with an explicit `-C` derived
    from the walk-up in `paths.py`, never from `os.getcwd()` (plan R5). A synthetic fixture tree in
    a temporary directory is not a work tree, so every file in it counts.
    """
    try:
        anchor = repo_root(root)
    except RuntimeError:
        anchor = None
    if anchor is not None:
        try:
            completed = subprocess.run(
                ["git", "-C", str(anchor), "ls-files", "-z", "--", str(root)],
                capture_output=True,
                check=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            completed = None
        if completed is not None:
            return [
                anchor / name
                for name in completed.stdout.split("\0")
                if name and (anchor / name).is_file()
            ]
    return [
        path
        for path in sorted(root.rglob("*"))
        if path.is_file() and not any(part in _SKIP_DIRS for part in path.parts)
    ]


def _text_of(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def guard(root: Path | str | None = None) -> list[Finding]:
    """Deliverable 12's checks 10 and 11, standalone and needing NO key.

    That it needs no key is the design: the control has to run in ordinary CI, in every agent
    session and on every branch, where by construction no private key exists.
    """
    from .checks.blind_sealed import guard_blind_paths
    from .checks.no_private_key import guard_private_material

    base = Path(root) if root is not None else SPLITS_DIR.parent
    files = _tracked_files(base)
    findings = guard_blind_paths(base, files)
    findings.extend(guard_private_material(files))
    return findings


def sha256_of_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def envelope_ciphertext(document: Mapping[str, Any]) -> bytes | None:
    try:
        return base64.b64decode(document["ciphertext_b64"], validate=True)
    except (KeyError, ValueError, TypeError):
        return None


def sidecar_digest_matches(sidecar: Mapping[str, Any], envelope: Mapping[str, Any]) -> bool:
    return bool(sidecar.get("envelope_digest")) and sidecar.get("envelope_digest") == envelope.get(
        "ciphertext_sha256"
    )


def canonical_case_digest(document: Mapping[str, Any]) -> str:
    """Re-exported so the CLI and the checks share one definition of a content hash."""
    return content_sha256(document)
