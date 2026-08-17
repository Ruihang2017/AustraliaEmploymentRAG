"""`assemble_bundle()` — stage, gate, sign, and only then rename (CRPS-06 deliverables 2 and 11).

THE ORDERING CONSTRAINT IS THE WHOLE SAFETY ARGUMENT. PRD §12.2: *"Failed releases MUST NOT modify
active production data."* PRD §18.4: *"Active data MUST never be rebuilt or mutated in place."*
Deliverable 11 fixes the order, and this is it, literally:

    1. refuse if output_dir/corpus-release-<release_id> already exists      (nothing is done)
    2. stage into output_dir/.staging/<release_id>/
         corpus.sqlite -> vectors.usearch + embedding-manifest.json -> tantivy/
    3. gates, phase A: completeness, time, identity, citation, licensing, smoke, evaluation,
       and gate 8's PIN PREFLIGHT — with no manifest on disk yet
    4. any BLOCKING finding -> REJECTED: write the gate report and the release diff OUTSIDE the
       bundle, delete the staging bundle, exit. NOTHING was ever created at the final path.
    5. build_release_manifest() -> sign_manifest() (if asked) -> write_manifest(), into STAGING
    6. gates, phase B: verify_bundle() over the staged bundle
    7. any BLOCKING finding -> REJECTED, exactly as step 4
    8. os.replace(staging bundle, final path)  <- THE ONLY MOVE, after the last gate
    9. write the gate report and the release diff, OUTSIDE the bundle — after the move, so a
       `decision: BUILT` report can only exist once the bundle it describes does. A rename that
       fails is a REJECTED build carrying `BUNDLE_PUBLISH_FAILED`, never a BUILT one with nothing
       behind it.

There is no window in which a partially built or ungated bundle exists at the final path, because
the final path is created by one directory rename that happens after everything else. A reviewer can
check this mechanically: every write in this module targets a path under `.staging/`, or a report
file that is a SIBLING of the bundle, and the single `os.replace` is at the end of
`assemble_bundle()`.

THE STAGED CORPUS DATABASE IS NEVER OPENED FOR WRITING. It is copied byte-for-byte with
`shutil.copyfile` and every subsequent open is `read_only=True`. Three consequences, all wanted:
the input database is provably byte-identical before and after a build; two builds of one input
produce the same `artifacts.corpus_sqlite_sha256`; and no gate can accidentally repair what it is
meant to report. In particular `corpus_meta.release_id` is NOT rewritten — `verify_bundle()` does
not compare it to `release_id` (it compares `versions.schema` to `corpus_meta.schema_version`), so
nothing requires the write.

WHY A `ManifestIncomplete` NEVER ESCAPES. `build_release_manifest()` raises it for an absent or
incomplete pin — but the acceptance checklist requires exactly that input to produce
`decision: REJECTED` with a dedicated blocking code. The manifest build is therefore wrapped, and a
`ValueError` from the manifest module becomes a BLOCKING `manifest`-gate finding. Only genuine I/O
and programming errors leave this function as exceptions.
"""

from __future__ import annotations

import json
import shutil
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from contracts.schema import open_corpus_database, utc_now
from manifest import (
    CoverageEntry,
    Counts,
    EmbeddingProfileRef,
    ManifestIncomplete,
    ReleaseManifest,
    build_release_manifest,
    not_run_evaluation,
    public_keys_from,
    sign_manifest,
    write_manifest,
)
from validation.context import BundleContext, read_only_connector
from validation.evaluation_report import load_evaluation_report, summary_of
from validation.findings import Finding, blocking
from validation.gates import merge_results, run_phase_a, run_phase_b

from .diff import ReleaseDiff, release_diff, write_release_diff
from .indexes import (
    INDEX_VERSION_ABSENT_SENTINEL,
    IndexBuildFailed,
    IndexBuildResult,
    NullLexicalIndexBuilder,
)
from .measure import Measurements, measure
from .plan import BuildRequest
from .report import (
    GateReport,
    gate_report_path,
    release_diff_path,
    write_gate_report,
)

__all__ = [
    "BuildOutcome",
    "BundlePaths",
    "FinalPathExists",
    "StagingNotEmpty",
    "assemble_bundle",
    "stage_bundle",
]

CORPUS_DATABASE = "corpus.sqlite"
VECTOR_INDEX = "vectors.usearch"
EMBEDDING_MANIFEST = "embedding-manifest.json"
EMBEDDING_BUILD_REPORT = "embedding-build-report.json"
RELEASE_MANIFEST = "release-manifest.json"
LEXICAL_INDEX_DIR = "tantivy"


class FinalPathExists(RuntimeError):
    """The output path already holds a release. This build refuses BEFORE doing any work.

    It never overwrites, merges into, or "helpfully" deletes an existing bundle: which release
    survives is a human's call, and PRD §35.8 invariant 8 forbids mutating an existing one.
    """


class StagingNotEmpty(RuntimeError):
    """A staging directory for this release id already exists.

    Two builds of the same release id collide loudly rather than interleaving — the directory is
    claimed by an atomic exclusive `mkdir`, so the loser of a race fails here rather than writing
    into the winner's bundle. EXISTENCE is the collision, not non-emptiness: an empty directory is
    exactly what the winner of a race has a moment after claiming it. A leftover file would also be
    reported as `BUNDLE_FILE_UNLISTED` by the bundle's own verifier.
    """


@dataclass(frozen=True)
class BundlePaths:
    staging_dir: Path
    bundle_dir: Path
    final_dir: Path
    corpus_db: Path
    lexical_index_dir: Path
    vector_index: Path
    embedding_manifest: Path
    release_manifest: Path
    gate_report: Path
    release_diff: Path


@dataclass(frozen=True)
class BuildOutcome:
    decision: str
    gate_report: GateReport
    bundle_dir: Path | None
    measurements: Measurements | None
    diff: ReleaseDiff
    gate_report_path: Path
    release_diff_path: Path

    @property
    def built(self) -> bool:
        return self.decision == "BUILT"

    @property
    def exit_code(self) -> int:
        """`0` built, `2` rejected by a gate. `1` is reserved for an internal error, which leaves
        this function as an exception rather than as an outcome."""
        return 0 if self.built else 2


# ==================================================================================================
# Staging
# ==================================================================================================


def stage_bundle(request: BuildRequest, *, index_builder: Any) -> tuple[BundlePaths, IndexBuildResult]:
    """Materialise the PRD §18.4 layout under `.staging/<release_id>/`, in deliverable 2's order."""
    paths = _paths_for(request)
    if paths.final_dir.exists():
        raise FinalPathExists(
            f"refusing to build: {paths.final_dir} already exists. An existing release is never "
            "overwritten, merged into or deleted by this build (PRD §35.8 invariant 8)"
        )
    # THE STAGING DIRECTORY IS CLAIMED BY AN ATOMIC EXCLUSIVE CREATE, not by looking first and
    # creating afterwards. `mkdir(exist_ok=False)` is a single filesystem operation that either
    # creates the directory or fails with `FileExistsError`, so two builds of the same release id —
    # a retried CI job racing its predecessor, say — cannot both conclude the path is free and then
    # interleave their writes into one bundle. That is what "collide loudly" has to mean: an
    # `exists()` check followed by `exist_ok=True` is a TOCTOU window, and the loser of the race
    # would silently corrupt the winner's bundle instead of failing.
    #
    # The claim is on the BUNDLE directory (`.staging/<release_id>/corpus-release-<release_id>`), so
    # it doubles as the lock: `.staging/<release_id>/` itself may be created by either racer.
    paths.staging_dir.mkdir(parents=True, exist_ok=True)
    try:
        paths.bundle_dir.mkdir(exist_ok=False)
    except FileExistsError as error:
        raise StagingNotEmpty(
            f"refusing to stage into {paths.bundle_dir}: it already exists. Either another build of "
            f"release {request.release_id!r} is running, or a previous one left it behind; a "
            "leftover file would also be reported as BUNDLE_FILE_UNLISTED by verify_bundle(). An "
            "existing staging directory is never reused, emptied or written into"
        ) from error
    except OSError as error:  # pragma: no cover — an unwritable output_dir is the operator's
        raise StagingNotEmpty(
            f"the staging directory {paths.bundle_dir} could not be created: {type(error).__name__}"
        ) from error

    # 1. the corpus database — a plain streaming byte copy. The staged copy is NEVER opened
    #    read-write, by anything, at any point (see the module docstring).
    shutil.copyfile(request.corpus_db_path, paths.corpus_db)
    # 2. CRPS-05's artifacts, copied opaquely. `usearch` is never imported: it is declared but not
    #    installed in this workspace (FND-01), and nothing here parses a vector file.
    shutil.copyfile(request.embedding_dir / VECTOR_INDEX, paths.vector_index)
    shutil.copyfile(request.embedding_dir / EMBEDDING_MANIFEST, paths.embedding_manifest)
    # 3. the lexical index, through the deliverable 3 port.
    result = index_builder.build(paths.corpus_db, paths.lexical_index_dir)
    return paths, result


def _paths_for(request: BuildRequest) -> BundlePaths:
    bundle = request.staging_dir / request.bundle_name
    return BundlePaths(
        staging_dir=request.staging_dir,
        bundle_dir=bundle,
        final_dir=request.final_dir,
        corpus_db=bundle / CORPUS_DATABASE,
        lexical_index_dir=bundle / LEXICAL_INDEX_DIR,
        vector_index=bundle / VECTOR_INDEX,
        embedding_manifest=bundle / EMBEDDING_MANIFEST,
        release_manifest=bundle / RELEASE_MANIFEST,
        gate_report=gate_report_path(request.output_dir, request.release_id),
        release_diff=release_diff_path(request.output_dir, request.release_id),
    )


# ==================================================================================================
# Manifest inputs, derived independently of the completeness gate
# ==================================================================================================


def _counts(connection: Any) -> Counts:
    """The manifest's counts.

    Written with its own queries rather than calling `validation.gates.corpus_counts()` ON PURPOSE:
    deliverable 4.1 requires the completeness gate to check that "counts in the manifest equal counts
    queried from the database", which is only a check when the two derivations are independent.
    """
    def scalar(sql: str) -> int:
        return int(connection.execute(sql).fetchone()[0])

    return Counts(
        sources=scalar("SELECT COUNT(id) FROM source"),
        documents=scalar("SELECT COUNT(id) FROM legal_document"),
        document_versions=scalar("SELECT COUNT(id) FROM document_version"),
        nodes=scalar("SELECT COUNT(id) FROM document_node"),
        node_versions=scalar("SELECT COUNT(id) FROM node_version"),
        relations=scalar("SELECT COUNT(id) FROM node_relation"),
        events=scalar("SELECT COUNT(id) FROM legal_event"),
        chunks=scalar("SELECT COUNT(id) FROM search_chunk"),
        embeddings=scalar("SELECT COUNT(*) FROM chunk_embedding"),
    )


def _coverage(connection: Any) -> tuple[CoverageEntry, ...]:
    """One `coverage` row per source group, carrying the state the source itself records.

    Nothing is invented here: the coverage status, the freshness status and the last ingestion time
    are the source row's own values (breakdown plan §8 Q10 permits a limited state only on measured
    evidence, which is `GOLD-16`'s to produce, never this build's to assert).
    """
    rows = connection.execute(
        "SELECT s.source_group_id, MIN(s.coverage_status), MIN(s.freshness_status),"
        " COUNT(DISTINCT d.id), MIN(dv.effective_from), MAX(dv.effective_from),"
        " MAX(s.last_ingestion_at)"
        " FROM source s"
        " LEFT JOIN legal_document d ON d.source_id = s.id"
        " LEFT JOIN document_version dv ON dv.document_id = d.id"
        " GROUP BY s.source_group_id ORDER BY s.source_group_id"
    ).fetchall()
    return tuple(
        CoverageEntry(
            source_group_id=str(row[0]),
            coverage_status=str(row[1]),
            freshness_status=str(row[2]),
            document_count=int(row[3]),
            earliest_effective_from=None if row[4] is None else str(row[4]),
            latest_effective_from=None if row[5] is None else str(row[5]),
            last_ingestion_at=None if row[6] is None else str(row[6]),
        )
        for row in rows
    )


def _embedding_profile(embedding: Mapping[str, Any]) -> EmbeddingProfileRef:
    """Built FROM the embedding manifest, so the two can never disagree by construction.

    `verify_bundle()` compares them anyway — this build is not the only consumer, and RETR-01
    re-implements that check in Rust.
    """
    return EmbeddingProfileRef(
        profile_id=str(embedding.get("profile_id")),
        model_id=str(embedding.get("model_id")),
        dimensions=int(embedding.get("dimensions", 0)),
        quantisation=str(embedding.get("quantisation")),
    )


def _read_json(path: Path) -> Mapping[str, Any] | None:
    if not path.is_file():
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return document if isinstance(document, dict) else None


# ==================================================================================================
# The orchestrator
# ==================================================================================================


def assemble_bundle(request: BuildRequest, *, index_builder: Any | None = None) -> BuildOutcome:
    """Deliverable 2 and deliverable 11's ordering constraint, end to end."""
    started_monotonic = time.monotonic()
    started_at = utc_now()
    builder = index_builder if index_builder is not None else NullLexicalIndexBuilder()

    paths, index_result = _stage_or_fail(request, builder)
    public_keys = public_keys_from(*request.public_key_paths) if request.public_key_paths else {}
    embedding = _read_json(paths.embedding_manifest)
    embedding_report = _read_json(request.embedding_dir / EMBEDDING_BUILD_REPORT)
    evaluation_summary, evaluation_report = _evaluation_for(request)

    declared_counts, coverage, input_findings = _manifest_inputs(paths)

    context = BundleContext(
        request=request,
        paths=paths,
        connect=read_only_connector(paths.corpus_db),
        parent_connect=(
            None
            if request.parent_corpus_db_path is None
            else read_only_connector(request.parent_corpus_db_path)
        ),
        embedding_manifest=embedding,
        embedding_report=embedding_report,
        index_result=index_result,
        index_builder_id=getattr(builder, "builder_id", "unknown"),
        public_keys=public_keys,
        declared_counts=declared_counts,
        manifest_document=None,
        evaluation_report=evaluation_report,
    )

    phase_a = run_phase_a(context)
    for finding in input_findings:
        phase_a.setdefault(finding.gate, []).append(finding)
    diff, diff_findings = _safe_release_diff(request, paths)
    for finding in diff_findings:
        phase_a.setdefault(finding.gate, []).append(finding)

    if _has_blocking(phase_a) or declared_counts is None or coverage is None:
        return _reject(
            request, paths, phase_a, {}, diff, started_at, started_monotonic, builder, index_result
        )

    manifest_findings = _build_and_write_manifest(
        request,
        paths,
        counts=declared_counts,
        coverage=coverage,
        evaluation=evaluation_summary,
        embedding=embedding,
        index_result=index_result,
        started_at=started_at,
    )
    if manifest_findings:
        return _reject(
            request,
            paths,
            phase_a,
            {"manifest": manifest_findings},
            diff,
            started_at,
            started_monotonic,
            builder,
            index_result,
        )

    phase_b = run_phase_b(context)
    if _has_blocking(phase_b):
        return _reject(
            request, paths, phase_a, phase_b, diff, started_at, started_monotonic, builder,
            index_result,
        )

    # MEASURED BEFORE THE MOVE, because the sizes are read from the staged paths; the rename does
    # not change a single byte, so the figures describe the published bundle exactly.
    measurements = measure(paths, started_monotonic=started_monotonic)

    # THE ONLY MOVE. After the last gate, and BEFORE the reports are written.
    #
    # THE REPORT IS WRITTEN LAST ON PURPOSE. A `decision: BUILT` report is an operator's evidence
    # that a bundle exists at the final path, and writing it first opened a window — however narrow
    # — in which a crash, a kill or a permission/disk failure during the rename left a report
    # claiming BUILT with no bundle anywhere. An operator or an automated verifier that trusts the
    # report over the filesystem would then act on a release that was never published. Ordering the
    # move first means a BUILT report only ever exists once the thing it describes does. The reports
    # are siblings of the bundle, so writing them still cannot change any hash the manifest recorded.
    try:
        paths.final_dir.parent.mkdir(parents=True, exist_ok=True)
        paths.bundle_dir.replace(paths.final_dir)
    except OSError as error:
        # The publication itself failed. Nothing is at the final path (`os.replace` onto a directory
        # is all-or-nothing, and a pre-existing final path was refused before any work began), so
        # this is a REJECTED build with a stated reason — never a BUILT one.
        failure = Finding(
            gate="manifest",
            code="BUNDLE_PUBLISH_FAILED",
            severity="BLOCKING",
            message=(
                f"every gate passed but the staged bundle could not be moved into the final output "
                f"path: {type(error).__name__}. Nothing was published"
            ),
            subject="bundle",
            evidence={"error_type": type(error).__name__},
        )
        merged_phase_b: dict[str, list[Finding]] = {
            gate: list(findings) for gate, findings in phase_b.items()
        }
        merged_phase_b.setdefault("manifest", []).append(failure)
        return _reject(
            request, paths, phase_a, merged_phase_b, diff, started_at, started_monotonic, builder,
            index_result,
        )
    _remove_staging_root(paths)

    report = GateReport(
        release_id=request.release_id,
        release_kind=request.release_kind,
        started_at=started_at,
        finished_at=utc_now(),
        gates=merge_results(phase_a, phase_b),
        decision="BUILT",
        measurements=measurements,
        staging_cleaned=False,
        staging_note="the staging bundle was renamed into the final path",
        index_builder_id=getattr(builder, "builder_id", "unknown"),
    )
    write_gate_report(report, paths.gate_report)
    write_release_diff(diff, paths.release_diff)

    return BuildOutcome(
        decision="BUILT",
        gate_report=report,
        bundle_dir=paths.final_dir,
        measurements=measurements,
        diff=diff,
        gate_report_path=paths.gate_report,
        release_diff_path=paths.release_diff,
    )


def _stage_or_fail(request: BuildRequest, builder: Any) -> tuple[BundlePaths, IndexBuildResult]:
    paths = _paths_for(request)
    try:
        return stage_bundle(request, index_builder=builder)
    except IndexBuildFailed:
        # An index builder that could not run is a gate finding, not an internal error — but it has
        # to reach the gates, so the staged bundle is described with a null result and gate 8's
        # `INDEX_BUILDER_NULL_ON_CANDIDATE` refuses it.
        return paths, IndexBuildResult(
            index_version=None,
            file_count=0,
            byte_size=0,
            doc_count=0,
            builder_id=getattr(builder, "builder_id", "unknown"),
        )


def _manifest_inputs(
    paths: BundlePaths,
) -> tuple[Counts | None, tuple[CoverageEntry, ...] | None, list[Finding]]:
    """The manifest's counts and coverage, or a BLOCKING finding saying why they are unavailable.

    A CORRUPT OR UNREADABLE STAGED DATABASE MUST BE A GATE REJECTION, not an internal error: that is
    exactly the `UAT-OPS-01` corpus-side replay ("corrupt candidate corpus fixture" -> "promotion
    blocked"), and an exception out of here would exit 1 and produce no gate report for the operator
    to read. This was caught by the replay test rather than by inspection.
    """
    try:
        with closing(open_corpus_database(paths.corpus_db, read_only=True)) as connection:
            return _counts(connection), _coverage(connection), []
    except Exception as error:  # noqa: BLE001 — see the docstring
        return (
            None,
            None,
            [
                Finding(
                    gate="completeness",
                    code="CORPUS_DATABASE_UNREADABLE",
                    severity="BLOCKING",
                    message=(
                        f"the staged {CORPUS_DATABASE} could not be read to derive the release "
                        f"manifest's counts and coverage: {type(error).__name__}"
                    ),
                    subject=CORPUS_DATABASE,
                )
            ],
        )


def _safe_release_diff(
    request: BuildRequest, paths: BundlePaths
) -> tuple[ReleaseDiff, list[Finding]]:
    """The parent-to-candidate diff, or an empty diff plus a BLOCKING finding. Same reason as above.

    The diff is written even for a rejected build — an operator needs to see what the candidate was
    trying to change — so a failure to compute it is reported rather than raised.
    """
    try:
        return release_diff(request.parent_corpus_db_path, paths.corpus_db), []
    except Exception as error:  # noqa: BLE001
        return (
            ReleaseDiff(parent_present=request.parent_corpus_db_path is not None),
            [
                Finding(
                    gate="completeness",
                    code="CORPUS_DATABASE_UNREADABLE",
                    severity="BLOCKING",
                    message=(
                        "the parent-to-candidate release diff could not be computed: "
                        f"{type(error).__name__}"
                    ),
                    subject="release-diff.json",
                )
            ],
        )


def _evaluation_for(request: BuildRequest) -> tuple[Any, Any]:
    if request.evaluation_report_path is None:
        return not_run_evaluation(), None
    report, findings = load_evaluation_report(request.evaluation_report_path)
    if report is None or findings:
        # The GATE grades absence and malformation; the manifest simply records that no evaluation
        # summary could be derived. `NOT_RUN` stays explicit and visible.
        return not_run_evaluation(), None
    return summary_of(report), report


def _has_blocking(phase: Mapping[str, list[Finding]]) -> bool:
    return any(blocking(findings) for findings in phase.values())


def _build_and_write_manifest(
    request: BuildRequest,
    paths: BundlePaths,
    *,
    counts: Counts,
    coverage: tuple[CoverageEntry, ...],
    evaluation: Any,
    embedding: Mapping[str, Any] | None,
    index_result: IndexBuildResult,
    started_at: str,
) -> list[Finding]:
    """Build, sign and write the manifest into STAGING. Returns findings, never raises upward."""
    if embedding is None:
        return [
            Finding(
                gate="manifest",
                code="EMBEDDING_MANIFEST_UNPARSEABLE",
                severity="BLOCKING",
                message=(
                    f"{EMBEDDING_MANIFEST} could not be read from the staged bundle, so the release "
                    "manifest cannot record what produced the indexed vectors"
                ),
                subject=EMBEDDING_MANIFEST,
            )
        ]
    # `release-manifest.schema.json` types `versions.index` as a NON-EMPTY STRING, so a null index
    # version travels as the declared sentinel rather than as `null`, which would make the bundle
    # fail its own verification with MANIFEST_SCHEMA_INVALID (sub-PRD D16).
    from dataclasses import replace as _replace

    versions = _replace(
        request.versions,
        index=index_result.index_version or INDEX_VERSION_ABSENT_SENTINEL,
    )
    try:
        manifest: ReleaseManifest = build_release_manifest(
            paths.bundle_dir,
            release_id=request.release_id,
            release_kind=request.release_kind,
            parent_release_id=request.parent_release_id,
            versions=versions,
            compatibility=request.compatibility,
            counts=counts,
            coverage=coverage,
            quarantine=_quarantine_for(paths),
            evaluation=evaluation,
            embedding_profile=_embedding_profile(embedding),
            local_models=request.local_model_pins,
            runtime=request.runtime_pin,
            build_started_at=started_at,
            build_finished_at=utc_now(),
        )
    except (ManifestIncomplete, ValueError) as error:
        return [
            Finding(
                gate="manifest",
                code="MANIFEST_BUILD_FAILED",
                severity="BLOCKING",
                message=(
                    f"the release manifest could not be built: {type(error).__name__}: {error}"
                ),
                subject="release-manifest.json",
            )
        ]

    if request.signing_requested:
        try:
            assert request.signing_key_path is not None and request.signing_key_id is not None
            manifest = sign_manifest(
                manifest,
                private_key_path=request.signing_key_path,
                key_id=request.signing_key_id,
            )
        except Exception as error:  # noqa: BLE001 — every signing failure is a gate rejection
            # NO KEY MATERIAL and no key path in the message (PRD §20.2): the exception TYPE and the
            # key id are what an operator needs, and the key id is public by construction.
            return [
                Finding(
                    gate="manifest",
                    code="MANIFEST_SIGNING_FAILED",
                    severity="BLOCKING",
                    message=(
                        f"signing was requested and failed with {type(error).__name__}. The bundle "
                        "is NOT renamed into the final output path: the rename is the last step and "
                        "simply never happens"
                    ),
                    subject="signature",
                    evidence={"key_id": request.signing_key_id},
                )
            ]

    write_manifest(manifest, paths.release_manifest)
    return []


def _quarantine_for(paths: BundlePaths) -> Any:
    from validation.quarantine import quarantine_summary

    with closing(open_corpus_database(paths.corpus_db, read_only=True)) as connection:
        return quarantine_summary(connection)


def _reject(
    request: BuildRequest,
    paths: BundlePaths,
    phase_a: Mapping[str, list[Finding]],
    phase_b: Mapping[str, list[Finding]],
    diff: ReleaseDiff,
    started_at: str,
    started_monotonic: float,
    builder: Any,
    index_result: IndexBuildResult,
) -> BuildOutcome:
    """Write the evidence, delete the staging bundle, and leave the final path untouched."""
    measurements = measure(paths, started_monotonic=started_monotonic)
    cleaned, note = _remove_staging(paths)
    report = GateReport(
        release_id=request.release_id,
        release_kind=request.release_kind,
        started_at=started_at,
        finished_at=utc_now(),
        gates=merge_results(phase_a, phase_b),
        decision="REJECTED",
        measurements=measurements,
        staging_cleaned=cleaned,
        staging_note=note,
        index_builder_id=getattr(builder, "builder_id", "unknown"),
    )
    # A REJECTED build still writes its evidence: an operator must be able to see why without
    # re-running the build (ADM-001 internal visibility, PRD §12.2).
    write_gate_report(report, paths.gate_report)
    write_release_diff(diff, paths.release_diff)
    _ = index_result
    return BuildOutcome(
        decision="REJECTED",
        gate_report=report,
        bundle_dir=None,
        measurements=measurements,
        diff=diff,
        gate_report_path=paths.gate_report,
        release_diff_path=paths.release_diff,
    )


def _remove_staging(paths: BundlePaths) -> tuple[bool, str | None]:
    """Remove the staging bundle. A failure is RECORDED, never swallowed."""
    try:
        shutil.rmtree(paths.bundle_dir, ignore_errors=False)
    except OSError as error:
        return False, (
            f"the staging bundle at {paths.bundle_dir} could not be removed "
            f"({type(error).__name__}); it was left in place and nothing was written to the final "
            "output path"
        )
    _remove_staging_root(paths)
    return True, None


def _remove_staging_root(paths: BundlePaths) -> None:
    """Remove `.staging/<release_id>/` once it is empty. An in-use root is simply left alone."""
    try:
        if paths.staging_dir.is_dir() and not any(paths.staging_dir.iterdir()):
            paths.staging_dir.rmdir()
    except OSError:  # pragma: no cover — a concurrent build's directory is not ours to remove
        return
