"""The consumer smoke helper (CRPS-08 deliverable 9).

This is the executable form of `E07`'s exit evidence *"Immutable fixture opens in search"* on the
corpus side: exactly what `RETR-01` does at its boundary, in the order it must do it —

1. verify the manifest FIRST (PRD §21: *"Trust application/corpus artifacts only after
   signature/hash/compatibility verification"*), and refuse anything that is not a verified
   `SYNTHETIC_FIXTURE`;
2. open `corpus.sqlite` READ-ONLY (PRD §18.3);
3. run the three canonical queries — exact provision lookup, neutral-citation lookup, and
   point-in-time node resolution at each of the three time points;
4. assert the three dates resolve to THREE DIFFERENT node versions, because a fixture where they
   all returned the same row would let a temporal regression downstream pass silently.

It imports nothing from `services/search-rs` (that is `11-retrieval-engine`'s module), never opens
the database read-write, and reads no evaluation material (PRD §14.3 blind-gold boundary).
"""

from __future__ import annotations

import sys
from pathlib import Path

_FIXTURES_DIR = Path(__file__).resolve().parent
if str(_FIXTURES_DIR) not in sys.path:
    sys.path.insert(0, str(_FIXTURES_DIR))

from generator._paths import COMMITTED_BUNDLE_DIR, DEV_PUBLIC_KEYFILE, ensure_src_on_path

ensure_src_on_path()

from contracts.schema import open_corpus_database  # noqa: E402
from manifest import public_keys_from, verify_bundle  # noqa: E402

__all__ = [
    "ACT_OFFICIAL_IDENTIFIER",
    "CASE_NEUTRAL_CITATION",
    "TIME_POINTS",
    "FixtureNotLoadable",
    "assert_fixture_loadable",
]

ACT_OFFICIAL_IDENTIFIER = "SYN2026A00001"
CASE_NEUTRAL_CITATION = "[2026] SYNFC 7"
TIME_POINTS: tuple[str, ...] = ("2019-07-01", "2022-07-01", "2025-07-01")

_POINT_IN_TIME_SQL = (
    "SELECT n.id, n.canonical_text FROM node_version AS n"
    " JOIN document_node AS d ON d.id = n.document_node_id"
    " JOIN legal_document AS l ON l.id = d.document_id"
    " WHERE l.official_identifier = ?"
    "   AND d.stable_node_key = ?"
    "   AND n.effective_from IS NOT NULL"
    "   AND n.effective_from <= ?"
    "   AND (n.effective_to IS NULL OR n.effective_to >= ?)"
)

_SECTION_NODE_KEY = "part-2/div-3/s14"


class FixtureNotLoadable(AssertionError):
    """The bundle did not verify, or did not answer a canonical query as the fixture promises."""


def assert_fixture_loadable(bundle_dir: str | Path = COMMITTED_BUNDLE_DIR) -> None:
    """Raise `FixtureNotLoadable` unless the bundle verifies AND answers all three queries."""
    bundle = Path(bundle_dir)
    report = verify_bundle(bundle, public_keys=public_keys_from(DEV_PUBLIC_KEYFILE))
    if not report.ok:
        raise FixtureNotLoadable(
            f"{bundle} does not verify: "
            + "; ".join(f"{finding.code} [{finding.subject}]" for finding in report.blocking())
        )
    if report.release_kind != "SYNTHETIC_FIXTURE":
        raise FixtureNotLoadable(
            f"{bundle} declares release_kind {report.release_kind!r}; this helper loads the "
            "synthetic fixture only, and a fixture must never be mistakable for a real release"
        )

    connection = open_corpus_database(bundle / "corpus.sqlite", read_only=True)
    try:
        provision = connection.execute(
            "SELECT id, canonical_title FROM legal_document WHERE official_identifier = ?",
            (ACT_OFFICIAL_IDENTIFIER,),
        ).fetchall()
        if len(provision) != 1:
            raise FixtureNotLoadable(
                f"exact provision lookup for {ACT_OFFICIAL_IDENTIFIER!r} returned "
                f"{len(provision)} rows, expected 1"
            )

        citation = connection.execute(
            "SELECT id, canonical_title FROM legal_document WHERE neutral_citation = ?",
            (CASE_NEUTRAL_CITATION,),
        ).fetchall()
        if len(citation) != 1:
            raise FixtureNotLoadable(
                f"neutral-citation lookup for {CASE_NEUTRAL_CITATION!r} returned "
                f"{len(citation)} rows, expected 1"
            )

        resolved: list[str] = []
        for date in TIME_POINTS:
            rows = connection.execute(
                _POINT_IN_TIME_SQL,
                (ACT_OFFICIAL_IDENTIFIER, _SECTION_NODE_KEY, date, date),
            ).fetchall()
            if len(rows) != 1:
                raise FixtureNotLoadable(
                    f"point-in-time resolution at {date} returned {len(rows)} node versions of "
                    f"{_SECTION_NODE_KEY!r}, expected exactly 1"
                )
            resolved.append(rows[0][0])
        if len(set(resolved)) != len(TIME_POINTS):
            raise FixtureNotLoadable(
                f"the {len(TIME_POINTS)} time points resolve to only {len(set(resolved))} distinct "
                "node versions; a temporal test against this fixture would pass vacuously"
            )
    finally:
        # An open handle also blocks a caller's temp-directory teardown on Windows.
        connection.close()
