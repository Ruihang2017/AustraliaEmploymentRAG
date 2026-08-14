"""Safety scans over `pipelines/corpus-builder/fixtures/**`.

THE PRIVATE-KEY HEADER LITERAL IS ASSEMBLED FROM PARTS, never spelled out.
`.github/workflows/checks/secret-scan.mjs` scans every git-tracked file for it and its excluded-path
list is asserted to hold exactly one entry, so a test file that wrote the header out would fail CI on
this very branch. Same trick, same reason, as `tests/manifest/test_no_private_keys_committed.py`.

Every scan here carries a positive control and an "it read something" assertion: a scanner that
matches nothing, or inspects no file, discharges nothing.
"""

from __future__ import annotations

import re
from pathlib import Path

from fixture_release_helpers import FIXTURES_DIR, REPO_ROOT

_SKIP_DIRS = {"__pycache__", ".pytest_cache", ".venv", "node_modules", "target"}

# Built from parts so this source file never carries the literal contiguously.
_HEADER = re.compile("-{5}" + "BEGIN" + r"[A-Z ]*" + "PRIVATE" + " " + "KEY" + "-{5}")
_SEED_MEMBER = re.compile('"' + "seed" + "_b64" + '"')
_BLIND_GOLD = re.compile(r"evals[/\\]gold|\bfrom\s+evals\b|\bimport\s+evals\b")
_NON_DETERMINISM = re.compile(
    r"\buuid4\b|\buuid1\b|\bimport\s+random\b|\bfrom\s+random\b|\brandom\.\w|\bimport\s+time\b|"
    r"\btime\.time\(|\bdatetime\.now\(|\bdate\.today\("
)


def _files() -> list[Path]:
    return sorted(
        path
        for path in FIXTURES_DIR.rglob("*")
        if path.is_file()
        and not path.is_symlink()
        and not any(part in _SKIP_DIRS for part in path.parts)
    )


def _text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return None


def test_the_scan_reads_something() -> None:
    assert len(_files()) >= 10


def test_no_private_key_block_under_fixtures() -> None:
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if (text := _text(path)) is not None and _HEADER.search(text)
    ]
    assert offenders == [], offenders


def test_the_header_scanner_matches_a_synthetic_header() -> None:
    """Positive control, assembled from parts."""
    assert _HEADER.search("-" * 5 + "BEGIN " + "RSA " + "PRIVATE " + "KEY" + "-" * 5)


def test_no_key_file_shape_under_fixtures() -> None:
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if path.suffix == ".json" and (text := _text(path)) is not None and _SEED_MEMBER.search(text)
    ]
    assert offenders == [], offenders


def test_no_private_key_filename_under_fixtures() -> None:
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if path.name.endswith(".private.json")
    ]
    assert offenders == [], offenders


def test_nothing_under_fixtures_touches_blind_gold() -> None:
    """PRD §14.3 / breakdown plan R9 — the blind-gold boundary."""
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if (text := _text(path)) is not None and _BLIND_GOLD.search(text)
    ]
    assert offenders == [], offenders


def test_the_blind_gold_scanner_matches_a_synthetic_reference() -> None:
    assert _BLIND_GOLD.search("open('evals/gold/case-001.json')")
    assert _BLIND_GOLD.search("import evals")


def test_the_generator_uses_no_clock_and_no_randomness() -> None:
    """Deliverable 4: ids are seed-derived, timestamps are constants.

    `contracts.schema.utc_now()` is the ONE clock read the package may make — it resolves a build
    timestamp the caller can pin — and it is not a match for any pattern here.
    """
    offenders: list[str] = []
    for path in _files():
        if path.suffix != ".py":
            continue
        text = _text(path)
        if text is None:
            continue
        for match in _NON_DETERMINISM.finditer(text):
            offenders.append(f"{path.relative_to(REPO_ROOT)}: {match.group(0)}")
    assert offenders == [], offenders


def test_the_non_determinism_scanner_matches_real_offenders() -> None:
    assert _NON_DETERMINISM.search("value = uuid.uuid4()")
    assert _NON_DETERMINISM.search("import random")
    assert _NON_DETERMINISM.search("stamp = datetime.now(UTC)")
    assert not _NON_DETERMINISM.search("from ._paths import BASE_TIMESTAMP")


def test_no_real_world_source_text_marker_slipped_in() -> None:
    """A cheap tripwire for pasted real material: real Australian instrument identifiers.

    It cannot prove the text is invented — the README's provenance statement and review do that —
    but a pasted Commonwealth Act would almost certainly carry one of these.
    """
    markers = re.compile(
        r"\bC\d{4}[AC]\d{5}\b|\bMA0000\d{2}\b|\bAustLII\b|\bComLaw\b|\blegislation\.gov\.au\b|"
        r"\bato\.gov\.au\b"
    )
    offenders = [
        str(path.relative_to(REPO_ROOT))
        for path in _files()
        if path.suffix in (".py", ".md", ".json")
        and (text := _text(path)) is not None
        and markers.search(text)
    ]
    assert offenders == [], offenders
    # Positive control: the synthetic identifiers deliberately do NOT match, the real shapes do.
    assert markers.search("C2026A00042")
    assert not markers.search("SYN2026A00001")
