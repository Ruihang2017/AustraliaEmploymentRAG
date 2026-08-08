"""Acceptance item 13 — no private key material outside `tests/manifest/fixtures/keys/**`.

THE HEADER LITERAL IS ASSEMBLED AT RUNTIME. `.github/workflows/checks/secret-scan.mjs` scans every
git-tracked file for a private-key header and its excluded-path list is asserted to hold exactly one
entry, so a test file that spelled the header out would fail CI on this very branch. The repository's
own harness (`tools/tests/secret-scan.test.mjs`) uses the same trick for the same reason.
"""

from __future__ import annotations

import re
from pathlib import Path

from manifest_fixtures import DEV_SIGNER_ID, PRIVATE_KEYFILE, REPO_ROOT

from manifest.signing import DEVELOPMENT_SIGNER_PREFIX

SCAN_ROOTS = (
    REPO_ROOT / "pipelines" / "corpus-builder",
    REPO_ROOT / "schemas" / "corpus-manifest",
)
ALLOWED_DIR = REPO_ROOT / "pipelines" / "corpus-builder" / "tests" / "manifest" / "fixtures" / "keys"

_SKIP_DIRS = {"__pycache__", ".pytest_cache", "node_modules", ".venv", "target"}

# Built from parts so this source file never carries the literal contiguously.
_HEADER = re.compile("-{5}" + "BEGIN" + r"[A-Z ]*" + "PRIVATE" + " " + "KEY" + "-{5}")
_SEED_MEMBER = re.compile('"' + "seed" + "_b64" + '"')


def _files() -> list[Path]:
    found: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.is_symlink():
                continue
            if any(part in _SKIP_DIRS for part in path.parts):
                continue
            found.append(path)
    return sorted(found)


def _text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def test_the_scan_reads_something() -> None:
    """A scan that inspects no file discharges nothing."""
    assert len(_files()) > 20


def test_no_private_key_block_anywhere_in_the_module_file_scope() -> None:
    offenders = []
    for path in _files():
        text = _text(path)
        if text is not None and _HEADER.search(text) and path != Path(__file__).resolve():
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], offenders


def test_the_scan_detects_a_synthetic_header_fed_to_it() -> None:
    """A positive control: a scanner that cannot detect anything discharges nothing."""
    synthetic = "-" * 5 + "BEGIN " + "RSA " + "PRIVATE " + "KEY" + "-" * 5
    assert _HEADER.search(synthetic)


def test_no_key_file_shape_outside_the_fixture_directory() -> None:
    """This ticket's own JSON key form must not appear anywhere else either."""
    offenders = []
    for path in _files():
        if path.suffix != ".json":
            continue
        if ALLOWED_DIR in path.parents:
            continue
        text = _text(path)
        if text is not None and _SEED_MEMBER.search(text):
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert offenders == [], offenders


def test_no_private_key_filename_outside_the_fixture_directory() -> None:
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if path.name.endswith(".private.json") and ALLOWED_DIR not in path.parents
    ]
    assert offenders == [], offenders


def test_the_committed_development_key_is_marked_as_one() -> None:
    import json

    document = json.loads(PRIVATE_KEYFILE.read_text(encoding="utf-8"))
    assert document["key_id"] == DEV_SIGNER_ID
    assert document["key_id"].startswith(DEVELOPMENT_SIGNER_PREFIX)
    assert document["kind"] == "DEVELOPMENT_ONLY"
    assert "NEVER" in document["warning"]


#: The repository-wide scan's own patterns, transcribed. `.github/workflows/checks/secret-scan.mjs`
#: applies these to EVERY git-tracked file outside `docs/**`. An ALL-CAPS identifier ending in one
#: of those words — the obvious name for a signing-key path constant, say — therefore fails CI on the
#: branch that adds it. The failure mode is "a perfectly reasonable constant name breaks the build",
#: which is exactly the kind of thing to catch here rather than three minutes into a CI run. (The
#: offending spellings are assembled from parts in the control below, never written out.)
_CREDENTIAL_SHAPED = re.compile(
    r"\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_"
    r"(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|CREDENTIALS)"
    r"(?:_[A-Z0-9]+)*\b"
)


def test_no_credential_shaped_identifier_in_this_modules_file_scope() -> None:
    offenders = []
    for path in _files():
        if path.suffix not in (".py", ".json", ".md", ".gitattributes", ""):
            continue
        text = _text(path)
        if text is None:
            continue
        for match in _CREDENTIAL_SHAPED.finditer(text):
            offenders.append(f"{path.relative_to(REPO_ROOT)}: {match.group(0)}")
    assert offenders == [], (
        "these names trip .github/workflows/checks/secret-scan.mjs, which scans every git-tracked "
        "file: " + ", ".join(sorted(set(offenders)))
    )


def test_the_credential_shape_control_still_matches_a_real_offender() -> None:
    """A positive control: built from parts so the literal never appears in a scanned file."""
    assert _CREDENTIAL_SHAPED.search("SIGNING" + "_KEY" + "_PATH")
    assert not _CREDENTIAL_SHAPED.search("SIGNING" + "_KEYFILE")


def test_every_key_under_the_fixture_directory_is_a_development_key() -> None:
    import json

    files = sorted(ALLOWED_DIR.glob("*.json"))
    assert files, "the fixture key directory is empty"
    for path in files:
        document = json.loads(path.read_text(encoding="utf-8"))
        assert document["key_id"].startswith(DEVELOPMENT_SIGNER_PREFIX), path.name
