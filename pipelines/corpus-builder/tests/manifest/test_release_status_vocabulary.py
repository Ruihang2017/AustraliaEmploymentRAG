"""The Q-CRPS-4 drift guard for `corpus_release.status`.

`schema/corpus/002_enums.map.json` lists `corpus_release.status` as a PENDING family under gap
Q-CRPS-4 / `FND-03`: there is no canonical vocabulary to consume, so `persist.py` carries one named
placeholder mapping. This test is what makes that placeholder self-reporting — the day `FND-03`
publishes a `CorpusReleaseStatus` family, it either agrees with the published members or it fails.
"""

from __future__ import annotations

import json

from manifest_fixtures import REPO_ROOT

from contracts.paths import CONTRACTS_ENUM_EXPORT
from manifest.persist import RELEASE_KIND_TO_STATUS

_ENUM_MAP = REPO_ROOT / "pipelines" / "corpus-builder" / "schema" / "corpus" / "002_enums.map.json"


def _published_families() -> dict[str, list[str]]:
    if not CONTRACTS_ENUM_EXPORT.is_file():
        return {}
    document = json.loads(CONTRACTS_ENUM_EXPORT.read_text(encoding="utf-8"))
    families = document.get("families") if isinstance(document, dict) else None
    if not isinstance(families, dict):
        return {}
    return {
        name: [str(member) for member in body.get("values", [])]
        for name, body in families.items()
        if isinstance(body, dict)
    }


def _candidate_family_names() -> list[str]:
    return [
        name
        for name in _published_families()
        if "corpusrelease" in name.replace("_", "").replace("-", "").lower()
        and "status" in name.lower()
    ]


def test_the_gap_is_still_recorded_where_crps_01_recorded_it() -> None:
    document = json.loads(_ENUM_MAP.read_text(encoding="utf-8"))
    pending = json.dumps(document)
    assert "corpus_release" in pending and "Q-CRPS-4" in pending


def test_the_placeholder_mapping_agrees_with_the_published_family_the_day_it_lands() -> None:
    families = _candidate_family_names()
    if not families:
        # FND-03 has not published it yet. Assert the ABSENCE so this test fires the day it does.
        assert _candidate_family_names() == [], (
            "a CorpusReleaseStatus family now exists; delete this branch and consume it"
        )
        return
    published = set(_published_families()[families[0]])
    missing = set(RELEASE_KIND_TO_STATUS.values()) - published
    assert not missing, (
        f"FND-03 now publishes {families[0]} and it does not contain {sorted(missing)}. "
        "Q-CRPS-4 is resolved: consume the published vocabulary in manifest/persist.py and, if the "
        "ticket needs an explicit status argument, raise a ticket change against CRPS-02."
    )


def test_the_placeholder_is_a_single_named_constant() -> None:
    """One mapping, in one place, so resolving Q-CRPS-4 is a one-symbol change."""
    source = (
        REPO_ROOT / "pipelines" / "corpus-builder" / "src" / "manifest" / "persist.py"
    ).read_text(encoding="utf-8")
    definitions = [
        line for line in source.splitlines() if line.startswith("RELEASE_KIND_TO_STATUS")
    ]
    assert len(definitions) == 1, definitions
    assert "Q-CRPS-4" in source and "FND-03" in source


def test_the_published_family_reader_can_actually_read_the_export() -> None:
    """Guard the reader itself: a parser that returns {} for everything would never fire."""
    assert "LegalStatus" in _published_families()
