"""`GOLD_RESOLVES` — two-mode gold resolution (sub-PRD D7; PRD §43.2, §40.9).

WITH `--release <bundle-dir>`:
  1. the bundle is verified through **CRPS-02's** `verify_bundle()`, never by a re-implementation
     here — that verifier is the trust boundary PRD §21 defines, and a second copy of it would be a
     second thing to get wrong. A non-`ok` report becomes a FAIL carrying CRPS-02's own finding
     codes;
  2. `corpus.sqlite` is opened READ-ONLY and each authority is resolved with three assertions:
     `document_version.id = version_id`, `node_version.id = node_id`, and consistency
     (`node_version.document_version_id = version_id`, `document_version.document_id =
     document_id`). An id that exists but belongs to a different document is a FAIL, not a pass —
     that is the whole reason the third assertion exists.

WITHOUT `--release`: one `UNRESOLVED` finding per gold entry. Never `pass`. Sub-PRD Q-GOLD-D records
why no release necessarily exists yet, and PRD §40.9 makes an unresolvable gold citation a blocking
condition at release, so defaulting this check to pass would silently discharge that gate.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from ..findings import Finding
from ..model import Dataset
from ..paths import REPO_ROOT
from . import CheckContext
from ._common import categories

_ID = "GOLD_RESOLVES"


def check(dataset: Dataset, context: CheckContext) -> list[Finding]:
    if context.release is None:
        return _unresolved(dataset, context)
    findings = _verify_release(context)
    findings.extend(_resolve(dataset, context))
    return findings


def _unresolved(dataset: Dataset, context: CheckContext) -> list[Finding]:
    findings: list[Finding] = []
    for entry in categories(dataset, context.category):
        for case in entry.cases:
            count = len(case.gold_authorities)
            if count:
                findings.append(
                    Finding(
                        _ID,
                        "UNRESOLVED",
                        entry.slug,
                        case.id,
                        f"{count} gold authorit(ies) cannot be resolved: no --release was supplied. "
                        "Sub-PRD Q-GOLD-D; PRD §40.9 makes an unresolvable gold citation blocking at "
                        "release, so this is reported and never passed.",
                        str(case.path),
                    )
                )
    return findings


def _verify_release(context: CheckContext) -> list[Finding]:
    """Delegate to CRPS-02. Any import or verification failure is a FAIL, never a silent skip."""
    bundle = context.release
    assert bundle is not None
    corpus_src = str(REPO_ROOT / "pipelines" / "corpus-builder" / "src")
    if corpus_src not in sys.path:
        sys.path.insert(0, corpus_src)
    try:
        from manifest import public_keys_from, verify_bundle  # type: ignore[import-not-found]
    except ImportError as error:
        return [
            Finding(
                _ID,
                "FAIL",
                "<release>",
                None,
                f"CRPS-02's verifier could not be imported ({type(error).__name__}); a release is "
                "never trusted without it",
                str(bundle),
            )
        ]
    try:
        trusted = public_keys_from(*context.release_public_keys)
        report = verify_bundle(Path(bundle), public_keys=trusted)
    except Exception as error:  # noqa: BLE001 — any failure here means "not verified"
        return [
            Finding(
                _ID,
                "FAIL",
                "<release>",
                None,
                f"release verification raised {type(error).__name__}",
                str(bundle),
            )
        ]
    if report.ok:
        return []
    codes = ", ".join(sorted({finding.code for finding in report.blocking()}))
    return [
        Finding(
            _ID,
            "FAIL",
            "<release>",
            None,
            f"CRPS-02 verify_bundle reported blocking findings: {codes}",
            str(bundle),
        )
    ]


def _resolve(dataset: Dataset, context: CheckContext) -> list[Finding]:
    bundle = context.release
    assert bundle is not None
    database = Path(bundle) / "corpus.sqlite"
    if not database.is_file():
        return [
            Finding(_ID, "FAIL", "<release>", None, "the release bundle holds no corpus.sqlite", str(bundle))
        ]

    findings: list[Finding] = []
    connection = sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)
    try:
        for entry in categories(dataset, context.category):
            for case in entry.cases:
                for index, authority in enumerate(case.gold_authorities):
                    problem = _resolve_one(connection, authority)
                    if problem is not None:
                        findings.append(
                            Finding(
                                _ID,
                                "FAIL",
                                entry.slug,
                                case.id,
                                f"gold_authorities[{index}] {problem}",
                                str(case.path),
                            )
                        )
    finally:
        connection.close()
    return findings


def _resolve_one(connection: sqlite3.Connection, authority) -> str | None:
    version_row = connection.execute(
        "SELECT document_id FROM document_version WHERE id = ?", (authority.version_id,)
    ).fetchone()
    if version_row is None:
        return "version_id does not resolve in the pinned release"
    if version_row[0] != authority.document_id:
        return "version_id resolves but belongs to a different document_id"

    node_row = connection.execute(
        "SELECT document_version_id FROM node_version WHERE id = ?", (authority.node_id,)
    ).fetchone()
    if node_row is None:
        return "node_id does not resolve in the pinned release"
    if node_row[0] != authority.version_id:
        return "node_id resolves but belongs to a different document version"
    return None
