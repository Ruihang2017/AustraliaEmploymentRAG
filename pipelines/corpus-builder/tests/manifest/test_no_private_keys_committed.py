"""Acceptance item 13 — no private key material outside `tests/manifest/fixtures/keys/**`.

THE HEADER LITERAL IS ASSEMBLED AT RUNTIME. `.github/workflows/checks/secret-scan.mjs` scans every
git-tracked file for a private-key header and its excluded-path list is asserted to hold exactly one
entry, so a test file that spelled the header out would fail CI on this very branch. The repository's
own harness (`tools/tests/secret-scan.test.mjs`) uses the same trick for the same reason.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import NamedTuple

import pytest

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


# ---------------------------------------------------------------------------------------------
# The credential-shape guard — DERIVED, never transcribed (FND-27).
#
# This guard used to carry its own combined regex standing in for six of the repository scan's
# eight patterns, and it knew nothing at all about the exclusion mechanism FND-24 built. That is
# the FND-11 / FND-12 / FND-19 defect class — a second copy of a decision, which drifts from the
# first and cannot be told when the first changes. It had already drifted: FND-24 recorded that a
# name in this module is a fixture identifier and not a credential, `secret-scan.mjs` went green,
# and this copy stayed red because it could not see the decision.
#
# So both halves are now READ from the repository's shared sources and never copied:
#
#   * the patterns from `tools/fixtures/secret-patterns.json#patterns` (FND-01's), each kept with
#     its `id`, because the pattern id is half of an exclusion's key and a finding that reports
#     only "something matched" cannot be matched against an exclusion;
#   * the exclusions from `.github/workflows/fixtures/secret-scan-exclusions.json` (FND-24's),
#     applied by the same three-part exact-equality key `secret-scan.mjs` applies.
#
# Do not re-transcribe either of them, and do not add a local allowlist, skip-list or "known
# names" set here: the only admissible source of an exception is FND-24's fixture. A missing or
# malformed fixture raises — never an empty exclusion list, and above all never a universal one.
#
# `secret-scan.mjs` applies its patterns to EVERY git-tracked file outside `docs/**`, so an
# ALL-CAPS identifier ending in one of those words — the obvious name for a signing-key path
# constant, say — fails CI on the branch that adds it. Catching that here takes seconds instead of
# three minutes into a CI run, which is the whole reason this local guard is kept. (The offending
# spellings are assembled from parts in the controls below, never written out: this file is itself
# scanned, by `secret-scan.mjs` and by this very test.)
# ---------------------------------------------------------------------------------------------

_PATTERNS_FIXTURE = REPO_ROOT / "tools" / "fixtures" / "secret-patterns.json"
_EXCLUSIONS_FIXTURE = REPO_ROOT / ".github" / "workflows" / "fixtures" / "secret-scan-exclusions.json"

#: The seven fields every exclusion entry must carry, in `secret-scan.mjs`'s own order so that the
#: two implementations reject a broken document at the same field.
_EXCLUSION_FIELDS = ("path", "patternId", "identifierSha256", "basis", "owner", "ticket", "date")

#: A validation shape for the digest field — lowercase hex SHA-256. Not a credential shape.
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")


class SecretScanFixtureError(RuntimeError):
    """A shared secret-scan fixture is missing or malformed.

    Raised, never swallowed. A guard that treats an unreadable exclusions file as "no exclusions"
    merely goes red for a new reason; one that treats it as "everything excluded" goes green while
    guarding nothing. Both are failures, and this exception exists so neither can happen quietly.
    """


def _load_patterns(fixture: Path = _PATTERNS_FIXTURE) -> list[tuple[str, re.Pattern[str]]]:
    """The repository's shared patterns, READ from FND-01's fixture — never transcribed.

    Returns `(pattern_id, compiled)` in fixture order. The id is carried because it is half of an
    exclusion's key.
    """
    try:
        document = json.loads(fixture.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SecretScanFixtureError(f"{fixture} is missing or unparseable: {error}") from error
    entries = document.get("patterns")
    if not isinstance(entries, list) or not entries:
        raise SecretScanFixtureError(f'{fixture}: "patterns" must be a non-empty array')
    compiled: list[tuple[str, re.Pattern[str]]] = []
    for index, entry in enumerate(entries):
        try:
            compiled.append((entry["id"], re.compile(entry["regex"])))
        except (KeyError, TypeError, re.error) as error:
            raise SecretScanFixtureError(f"{fixture} entry {index}: unusable pattern: {error}") from error
    return compiled


class Finding(NamedTuple):
    """One match, carrying everything an exclusion is keyed on."""

    path: str  #: repository-relative, forward slashes, as `git ls-files` spells it
    pattern_id: str
    text: str  #: the matched text, exactly as matched


def _digest_of(text: str) -> str:
    """`digestOf()` in `secret-scan.mjs`: UTF-8, lowercase hex, the matched text and nothing else."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _scan_text(text: str, label: str, patterns: list[tuple[str, re.Pattern[str]]]) -> list[Finding]:
    return [
        Finding(label, pattern_id, match.group(0))
        for pattern_id, pattern in patterns
        for match in pattern.finditer(text)
    ]


def _scan_roots(patterns: list[tuple[str, re.Pattern[str]]]) -> list[Finding]:
    findings: list[Finding] = []
    for path in _files():
        if path.suffix not in (".py", ".json", ".md", ".gitattributes", ""):
            continue
        text = _text(path)
        if text is None:
            continue
        # `.as_posix()` is the ONLY path handling permitted: it produces the forward-slash
        # repository-relative spelling the fixture uses (a `WindowsPath` would render backslashes
        # and silently match no exclusion here while matching on the Linux CI runner). No case
        # folding, no symlink resolution, no prefix logic — the scanner's own comment warns that
        # normalising "would be the first step towards a prefix match".
        findings.extend(_scan_text(text, path.relative_to(REPO_ROOT).as_posix(), patterns))
    return findings


def _validate_exclusions(document: object, where: str) -> list[dict]:
    """The same seven conditions `loadExclusions()` enforces, in the same order."""
    entries = document.get("exclusions") if isinstance(document, dict) else None
    if not isinstance(entries, list):
        raise SecretScanFixtureError(f'{where}: "exclusions" must be an array')
    declared = document.get("count")
    if declared != len(entries):
        raise SecretScanFixtureError(f"{where}: declared count {declared} != {len(entries)} entries")
    pattern_ids = {pattern_id for pattern_id, _ in _load_patterns()}
    seen: set[tuple[str, str, str]] = set()
    for index, entry in enumerate(entries):
        at = f"{where} entry {index}"
        if not isinstance(entry, dict):
            raise SecretScanFixtureError(f"{at}: must be an object")
        for field in _EXCLUSION_FIELDS:
            value = entry.get(field)
            if not isinstance(value, str) or not value:
                raise SecretScanFixtureError(f'{at}: "{field}" must be a non-empty string')
            if "*" in value or "?" in value:
                raise SecretScanFixtureError(
                    f'{at}: "{field}" contains a wildcard — a wildcard would blind the scan'
                )
        if entry["patternId"] not in pattern_ids:
            raise SecretScanFixtureError(
                f'{at}: "{entry["patternId"]}" is not one of the fixture pattern ids'
            )
        if not _DIGEST_RE.match(entry["identifierSha256"]):
            raise SecretScanFixtureError(f"{at}: identifierSha256 is not a lowercase hex SHA-256")
        triple = (entry["path"], entry["patternId"], entry["identifierSha256"])
        if triple in seen:
            raise SecretScanFixtureError(f"{at}: duplicate exclusion for {entry['path']}")
        seen.add(triple)
    return entries


def _load_exclusions(fixture: Path = _EXCLUSIONS_FIXTURE) -> list[dict]:
    """FND-24's shared exclusions, READ — never copied, never defaulted.

    Divergence from `secret-scan.mjs`, in mechanism only: the scanner loads eagerly at module
    import, whereas this is called lazily from each test that needs it. A module-level raise under
    pytest is a *collection* error that takes down the seven unrelated tests in this file and
    reports as an error rather than a named failure. Lazy is still loud, and fails the right test.
    The two implementations accept and reject exactly the same documents.
    """
    try:
        document = json.loads(fixture.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SecretScanFixtureError(f"{fixture} is missing or unparseable: {error}") from error
    return _validate_exclusions(document, str(fixture))


def _is_excluded(finding: Finding, exclusions: list[dict]) -> bool:
    """`isExcluded()` in `secret-scan.mjs`: all three parts, exact equality, no fallback."""
    digest = _digest_of(finding.text)
    return any(
        entry["path"] == finding.path
        and entry["patternId"] == finding.pattern_id
        and entry["identifierSha256"] == digest
        for entry in exclusions
    )


def test_no_credential_shaped_identifier_in_this_modules_file_scope() -> None:
    patterns = _load_patterns()
    exclusions = _load_exclusions()
    offenders = [
        f"{finding.path}: {finding.text} (pattern {finding.pattern_id})"
        for finding in _scan_roots(patterns)
        if not _is_excluded(finding, exclusions)
    ]
    assert offenders == [], (
        "these names trip .github/workflows/checks/secret-scan.mjs, which scans every git-tracked "
        "file: " + ", ".join(sorted(set(offenders)))
    )


def test_the_credential_shape_control_still_matches_a_real_offender() -> None:
    """A positive control: built from parts so the literal never appears in a scanned file."""
    patterns = _load_patterns()
    assert _scan_text("SIGNING" + "_KEY" + "_PATH", "<memory>", patterns)
    assert not _scan_text("SIGNING" + "_KEYFILE", "<memory>", patterns)


# --- controls: the derivation is real, and the filter is narrow -------------------------------
#
# Every credential-shaped string below is assembled at runtime from parts, because this file is
# scanned by `secret-scan.mjs` and by the guard above. A literal here would be a finding.

#: A synthetic path that exists in no fixture entry. Not a real file; nothing reads it.
_SYNTHETIC_PATH = "pipelines/corpus-builder/tests/chunking/synthetic_control.py"


def _entry_for(path: str, pattern_id: str, digest: str) -> dict:
    """One well-formed exclusion entry, for driving `_is_excluded` and `_validate_exclusions`."""
    return {
        "path": path,
        "patternId": pattern_id,
        "identifierSha256": digest,
        "basis": "a synthetic control entry, not a real exclusion",
        "owner": "00-foundation",
        "ticket": "FND-27",
        "date": "2026-08-17",
    }


def _document_with(*entries: dict) -> dict:
    return {"count": len(entries), "exclusions": list(entries)}


def test_the_shared_patterns_are_actually_loaded() -> None:
    """Read from FND-01's fixture, ids intact, and reported with the id that fired."""
    patterns = _load_patterns()
    document = json.loads(_PATTERNS_FIXTURE.read_text(encoding="utf-8"))
    assert len(patterns) == 8
    assert [pattern_id for pattern_id, _ in patterns] == [entry["id"] for entry in document["patterns"]]
    findings = _scan_text("SIGNING" + "_KEY" + "_PATH", "<memory>", patterns)
    assert [finding.pattern_id for finding in findings] == ["key"]


def test_the_shared_exclusions_are_actually_loaded() -> None:
    """Read from FND-24's fixture — non-empty, and as many entries as the document declares."""
    entries = _load_exclusions()
    document = json.loads(_EXCLUSIONS_FIXTURE.read_text(encoding="utf-8"))
    assert entries
    assert len(entries) == document["count"]


def test_the_exact_triple_is_excluded() -> None:
    """The paired positive. Without it the three narrowness controls below pass vacuously."""
    name = "SIGNING" + "_KEY" + "_PATH"
    finding = Finding(_SYNTHETIC_PATH, "key", name)
    assert _is_excluded(finding, [_entry_for(_SYNTHETIC_PATH, "key", _digest_of(name))])


def test_the_same_digest_at_a_different_path_is_not_excluded() -> None:
    name = "SIGNING" + "_KEY" + "_PATH"
    entry = _entry_for(_SYNTHETIC_PATH, "key", _digest_of(name))
    elsewhere = Finding("pipelines/corpus-builder/tests/chunking/other_control.py", "key", name)
    assert not _is_excluded(elsewhere, [entry])


def test_a_different_digest_at_an_excluded_path_is_not_excluded() -> None:
    name = "SIGNING" + "_KEY" + "_PATH"
    entry = _entry_for(_SYNTHETIC_PATH, "key", _digest_of(name))
    neighbour = Finding(_SYNTHETIC_PATH, "key", "SIGNING" + "_KEY" + "_DIRECTORY")
    assert not _is_excluded(neighbour, [entry])


def test_a_different_pattern_id_at_the_excluded_path_and_digest_is_not_excluded() -> None:
    name = "SIGNING" + "_KEY" + "_PATH"
    entry = _entry_for(_SYNTHETIC_PATH, "key", _digest_of(name))
    other_pattern = Finding(_SYNTHETIC_PATH, "secret", name)
    assert not _is_excluded(other_pattern, [entry])


def test_a_missing_exclusions_file_is_loud_and_not_an_empty_list(tmp_path: Path) -> None:
    absent = tmp_path / "absent.json"
    with pytest.raises(SecretScanFixtureError) as raised:
        _load_exclusions(absent)
    assert str(absent) in str(raised.value)


def test_an_unparseable_exclusions_file_is_loud(tmp_path: Path) -> None:
    broken = tmp_path / "broken.json"
    broken.write_text("{", encoding="utf-8")
    with pytest.raises(SecretScanFixtureError) as raised:
        _load_exclusions(broken)
    assert str(broken) in str(raised.value)


def test_a_non_list_exclusions_member_is_loud() -> None:
    with pytest.raises(SecretScanFixtureError) as raised:
        _validate_exclusions({"count": 0}, "<synthetic>")
    assert "<synthetic>" in str(raised.value)


def test_a_count_that_disagrees_with_the_entries_is_loud() -> None:
    entry = _entry_for(_SYNTHETIC_PATH, "key", "0" * 64)
    with pytest.raises(SecretScanFixtureError) as raised:
        _validate_exclusions({"count": 7, "exclusions": [entry]}, "<synthetic>")
    assert "<synthetic>" in str(raised.value)


def test_a_missing_or_empty_field_is_loud() -> None:
    for field in _EXCLUSION_FIELDS:
        entry = _entry_for(_SYNTHETIC_PATH, "key", "0" * 64)
        del entry[field]
        with pytest.raises(SecretScanFixtureError) as raised:
            _validate_exclusions(_document_with(entry), "<synthetic>")
        assert "<synthetic> entry 0" in str(raised.value)
        assert field in str(raised.value)

        emptied = _entry_for(_SYNTHETIC_PATH, "key", "0" * 64)
        emptied[field] = ""
        with pytest.raises(SecretScanFixtureError) as raised:
            _validate_exclusions(_document_with(emptied), "<synthetic>")
        assert "<synthetic> entry 0" in str(raised.value)


def test_a_wildcard_in_any_field_is_loud() -> None:
    for wildcard in ("*", "?"):
        entry = _entry_for("pipelines/corpus-builder/" + wildcard, "key", "0" * 64)
        with pytest.raises(SecretScanFixtureError) as raised:
            _validate_exclusions(_document_with(entry), "<synthetic>")
        assert "<synthetic> entry 0" in str(raised.value)
        assert "wildcard" in str(raised.value)


def test_an_unknown_pattern_id_is_loud() -> None:
    entry = _entry_for(_SYNTHETIC_PATH, "not-a-fixture-pattern", "0" * 64)
    with pytest.raises(SecretScanFixtureError) as raised:
        _validate_exclusions(_document_with(entry), "<synthetic>")
    assert "<synthetic> entry 0" in str(raised.value)


def test_a_digest_that_is_not_lowercase_hex_sha256_is_loud() -> None:
    for bad in ("0" * 63, "0" * 65, "A" * 64, "z" * 64):
        entry = _entry_for(_SYNTHETIC_PATH, "key", bad)
        with pytest.raises(SecretScanFixtureError) as raised:
            _validate_exclusions(_document_with(entry), "<synthetic>")
        assert "<synthetic> entry 0" in str(raised.value)


def test_a_duplicated_triple_is_loud() -> None:
    entry = _entry_for(_SYNTHETIC_PATH, "key", "0" * 64)
    with pytest.raises(SecretScanFixtureError) as raised:
        _validate_exclusions(_document_with(entry, dict(entry)), "<synthetic>")
    assert "<synthetic> entry 1" in str(raised.value)


def test_every_key_under_the_fixture_directory_is_a_development_key() -> None:
    import json

    files = sorted(ALLOWED_DIR.glob("*.json"))
    assert files, "the fixture key directory is empty"
    for path in files:
        document = json.loads(path.read_text(encoding="utf-8"))
        assert document["key_id"].startswith(DEVELOPMENT_SIGNER_PREFIX), path.name
