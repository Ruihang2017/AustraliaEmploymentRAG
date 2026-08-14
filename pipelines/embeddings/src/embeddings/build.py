"""`build_embeddings()` — the entry point, and the ordering constraint it must honour.

THE SEVEN STEPS, IN THIS ORDER (deliverable 3):

    1. select chunks whose tier satisfies CRPS-04's `is_eligible_for_dense()`
    2. order the selection deterministically by (node_version_id, chunk_ordinal)
    3. embed in batches of `profile.batch_size`, with bounded peak memory
    4. write vectors into the USearch index file, vector_key = f"{search_chunk_id}"
    5. write chunk_embedding rows — the PRD §35.3 five columns and nothing else
    6. emit embedding-manifest.json
    7. return counts, elapsed time, peak RSS, and the output file's sha256/byte size

STEPS 4-6 ARE ALL-OR-NOTHING. Everything is produced under a private work directory, and the three
published artifacts appear at their final paths only at the very end, each by `os.replace`. On any
exception nothing partial exists at a final path, while an interrupted run still has its resume
state.

The work directory is a SIBLING of the output directory (`<out>/../.<out>.embedding-work/`), not a
child of it, for two reasons that pull in opposite directions and are both hard:

* it must not be inside the bundle root, because PRD §18.4 fixes the release layout and CRPS-02's
  `verify_bundle` reports every unlisted file as `BUNDLE_FILE_UNLISTED`;
* it must SURVIVE a completed build, because deliverable 5's resume rule — "a changed `text_hash`
  forces re-embedding" — is the PRD §12.1 incremental-update path, which by definition starts from
  a build that finished. `chunk_embedding` has no column to carry a text hash and may not gain one
  (sub-PRD D14), so the state file is the only place that evidence can live.

A sibling directory also keeps `os.replace` on one filesystem, which is what makes publication
atomic rather than a copy.

WHY THE INDEX IS BUILT IN A SECOND PASS
----------------------------------------
Vectors are computed in batches (step 3) but handed to the index writer only afterwards, reading
them back from a fixed-record sidecar in the work directory, in the canonical order of step 2.
Two things fall out of that, and neither is achievable if the writer is fed as vectors are produced:

* A RESUMED run produces the same index as an uninterrupted one. The vectors computed before the
  interruption are still in the sidecar, so the final file holds every selected chunk — not only
  the ones this process happened to embed. Without this, `resume=True` would silently emit an index
  containing a fraction of the corpus while `chunk_embedding` claimed the whole of it.
* The on-disk vector order is the canonical order by construction, independent of batching.

The sidecar is fixed-record (`dimensions * 4` bytes, IEEE-754 binary32) and read back by seek, so
neither pass holds more than one batch of vectors in memory.

BOUNDED MEMORY. `selection.iter_chunk_texts` streams `(chunk, text)` in batches and each batch is
dropped before the next is fetched. The ordering key list IS materialised — it must be, to sort it
— but it holds ids and offsets, never text.

TRANSACTIONS. The corpus connection is autocommit (`isolation_level=None`), so each batch's
`chunk_embedding` inserts are wrapped in an explicit `BEGIN`/`COMMIT` — see `persist.py`. Per-row
autocommit plus a crash would leave rows a later resume treats as completed work.

PUBLICATION IS ONE GROUP, NOT THREE REPLACES
--------------------------------------------
`os.replace` is atomic for ONE file; three of them in a row are not atomic as a SET. A failure
between the first and the second (a full disk, a permission error, an anti-virus lock) would leave a
new `vectors.usearch` published beside a stale or absent `embedding-manifest.json` — an index whose
manifest describes a different row set, which is the one state PRD §18.4's bundle must never be in.
So `_Publication` records every replace it performs, preserving any file it displaced, and undoes
the whole group if a later member fails: a file that had a predecessor gets it back, a file that had
none is removed. The three published names therefore move together or not at all.

The same group is published INSIDE a `BEGIN IMMEDIATE` transaction on the corpus connection
(`persist.immediate_transaction`), which re-runs `assert_no_foreign_profiles` under SQLite's
RESERVED lock. The up-front `assert_profile_compatible` is a check-then-act on its own: two builds
could both pass it and both publish, producing exactly the mixed index PRD §14.4 forbids. Under the
lock the second build blocks and then fails, before it can publish.

A REBUILD MAY NOT DESTROY THE PREVIOUS INDEX BEFORE IT HAS REPLACED IT
----------------------------------------------------------------------
A non-resume run over a profile that has already been published used to COMMIT a `DELETE` of every
existing `chunk_embedding` row for it before embedding anything. If the rebuild then failed — a
provider error, a bad artefact pin, a disk error — the delete stayed committed while the previously
published `embedding-manifest.json` and `vectors.usearch` remained in place, now describing a row
set that no longer existed. The operator's response to a failed rebuild is to fix and retry, and in
the meantime the released bundle was silently inconsistent with the database it ships beside
(acceptance item 6's count invariant, and steps 4-6's all-or-nothing, both broken for the rebuild
case).

`_RebuildJournal` closes that: before the delete it streams the previous rows to disk and moves the
previous work directory aside, and on ANY later failure it puts both back. Combined with
`_Publication`'s rollback, a failed rebuild leaves the previous index — rows, vectors, manifest,
report and resume state — exactly as it found it. The journal is armed ONLY when there is something
to lose (a non-resume run with existing rows for this profile); a FIRST build must keep its
partially committed rows, because those rows plus the resume state are precisely what makes
`resume=True` able to finish it.

RESUME. `resume=True` skips a chunk when a `chunk_embedding` row exists for the same `profile_id`
AND the resume state records the same `search_chunk.text_hash`. A changed `text_hash` DELETES the
stale row and re-embeds exactly that chunk. A row with NO state entry also re-embeds: that is the
conservative direction, and it is forced — `chunk_embedding` has no column to carry the hash and
may not gain one (sub-PRD D14), so the state file is the only place it can live, and "no evidence
this row is current" has to mean "redo it".
"""

from __future__ import annotations

import array
import json
import os
import shutil
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

from ._bootstrap import load_contracts_schema
from .emit import (
    MANIFEST_FILENAME,
    VECTOR_FILENAME,
    build_embedding_manifest,
    stub_marked_runtime,
    write_embedding_manifest,
)
from .guard import assert_no_foreign_profiles, assert_profile_compatible
from .memory import peak_rss
from .persist import (
    batch_transaction,
    count_rows_for_profile,
    delete_rows_for_profile,
    existing_chunk_ids,
    immediate_transaction,
    insert_embedding_rows,
    iter_rows_for_profile,
)
from .profile import PinnedProfile, profile_fingerprint, resolve_effective_profile
from .provider import EmbeddingProvider
from .report import REPORT_FILENAME, EmbeddingBuildResult, write_build_report
from .selection import iter_chunk_texts, resolve_requested_tiers, select_chunks
from .vectors import UsearchIndexWriter, VectorIndexWriter

__all__ = [
    "JOURNAL_DIRNAME_SUFFIX",
    "WORK_DIRNAME_SUFFIX",
    "build_embeddings",
    "journal_directory_for",
    "vector_key_for",
    "work_directory_for",
]

#: Private to a build, and a SIBLING of the output directory — see the module docstring.
WORK_DIRNAME_SUFFIX = ".embedding-work"
#: Also a sibling, and for the same PRD §18.4 reason: it must not be inside the bundle root.
JOURNAL_DIRNAME_SUFFIX = ".embedding-rollback"
_RESUME_STATE = "resume-state.json"
_SIDECAR = "vectors.partial.bin"
_JOURNAL_ROWS = "previous-chunk-embedding-rows.jsonl"
_JOURNAL_WORK = "previous-work"
_PUBLICATION_BACKUP = "publication-backup"


def work_directory_for(out_dir: Path) -> Path:
    """The private work/resume directory beside *out_dir*, never inside it."""
    return out_dir.parent / f".{out_dir.name}{WORK_DIRNAME_SUFFIX}"


def journal_directory_for(out_dir: Path) -> Path:
    """The rebuild rollback journal beside *out_dir*, never inside it.

    A leftover journal directory means a rebuild died so hard it could not run its own rollback
    (the process was killed rather than the build failing). It holds the previous
    `chunk_embedding` rows and the previous resume state, so the previous index is recoverable by
    hand; the next non-resume rebuild starts a fresh journal and discards it.
    """
    return out_dir.parent / f".{out_dir.name}{JOURNAL_DIRNAME_SUFFIX}"


def vector_key_for(search_chunk_id: str) -> str:
    """Deliverable 3 step 4, verbatim: `vector_key = f"{search_chunk_id}"`.

    A function rather than an inline f-string so that what goes into `chunk_embedding.vector_key`
    and what the index writer is handed can never drift apart.
    """
    return f"{search_chunk_id}"


@dataclass
class _ResumeState:
    """`search_chunk_id` -> the embedded `text_hash` and its record index in the sidecar."""

    dimensions: int
    hashes: dict[str, str] = field(default_factory=dict)
    records: dict[str, int] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path, dimensions: int) -> "_ResumeState":
        if not path.is_file():
            return cls(dimensions=dimensions)
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            # A truncated state file means a crash mid-write. Treating it as empty re-embeds
            # everything, which is the conservative direction; trusting it could under-embed.
            return cls(dimensions=dimensions)
        if document.get("dimensions") != dimensions:
            # The sidecar's record width would be wrong. Start over rather than read garbage.
            return cls(dimensions=dimensions)
        return cls(
            dimensions=dimensions,
            hashes=dict(document.get("hashes") or {}),
            records=dict(document.get("records") or {}),
        )

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(
            {"dimensions": self.dimensions, "hashes": self.hashes, "records": self.records},
            sort_keys=True,
            indent=2,
        )
        temporary = path.with_name(path.name + ".partial")
        temporary.write_bytes((payload + "\n").encode("utf-8"))
        os.replace(temporary, path)


class _Sidecar:
    """Fixed-record float32 storage for vectors computed so far. Append to write, seek to read."""

    def __init__(self, path: Path, dimensions: int) -> None:
        self._path = path
        self._record_size = dimensions * 4
        self._dimensions = dimensions
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch(exist_ok=True)

    def append(self, vector: "array.array[float]") -> int:
        if len(vector) != self._dimensions:
            raise ValueError(
                f"vector has {len(vector)} components, expected {self._dimensions}"
            )
        with self._path.open("r+b") as handle:
            handle.seek(0, os.SEEK_END)
            index = handle.tell() // self._record_size
            handle.write(array.array("f", vector).tobytes())
            handle.flush()
            os.fsync(handle.fileno())
        return index

    def read(self, index: int) -> "array.array[float]":
        with self._path.open("rb") as handle:
            handle.seek(index * self._record_size)
            raw = handle.read(self._record_size)
        if len(raw) != self._record_size:
            raise ValueError(f"sidecar record {index} is truncated")
        values = array.array("f")
        values.frombytes(raw)
        return values


def _preserve(source: Path, destination: Path) -> None:
    """Keep a copy of *source* at *destination* cheaply: a hard link where the filesystem allows it.

    The journal and the publication backup are both siblings of the output directory, so they are on
    the same filesystem and a link costs nothing regardless of how large `vectors.usearch` is. The
    link survives `os.replace` over the original path — that unlinks a directory entry, not the
    inode — which is exactly what makes the restore possible. `shutil.copy2` is the fallback for a
    filesystem that refuses links.
    """
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(source, destination)
    except (OSError, NotImplementedError, AttributeError):
        shutil.copy2(source, destination)


class _Publication:
    """Publish several staged files as ONE all-or-nothing group. See the module docstring.

    `publish()` preserves whatever it displaces and remembers it; `roll_back()` undoes every replace
    performed so far, in reverse order — restoring a predecessor where there was one and removing
    the published file where there was not.
    """

    def __init__(self, backup_dir: Path) -> None:
        self._backup_dir = backup_dir
        #: (final path, backup path or None if nothing was displaced), in publication order.
        self._done: list[tuple[Path, Path | None]] = []

    def publish(self, staged: Path, final: Path) -> None:
        backup: Path | None = None
        if final.exists():
            backup = self._backup_dir / final.name
            if backup.exists():
                backup.unlink()
            _preserve(final, backup)
        os.replace(staged, final)
        self._done.append((final, backup))

    def roll_back(self) -> None:
        """Undo the group. Never raises: it runs while another exception is already propagating."""
        while self._done:
            final, backup = self._done.pop()
            try:
                if backup is not None:
                    os.replace(backup, final)
                elif final.exists():
                    final.unlink()
            except OSError:  # pragma: no cover - a filesystem that cannot undo its own replace
                continue


class _RebuildJournal:
    """Everything a non-resume rebuild is about to destroy, so a failed rebuild can put it back.

    ARMED ONLY WHEN THERE IS SOMETHING TO LOSE — a non-resume run that finds existing
    `chunk_embedding` rows for this profile. A first build must keep its partially committed rows:
    those rows plus the resume state are what `resume=True` finishes from, and restoring an empty
    snapshot over them would turn an interruption into lost work. See the module docstring.
    """

    def __init__(self, connection: sqlite3.Connection, profile_id: str, out_dir: Path) -> None:
        self._connection = connection
        self._profile_id = profile_id
        self._work_dir = work_directory_for(out_dir)
        self._directory = journal_directory_for(out_dir)
        self._rows_path = self._directory / _JOURNAL_ROWS
        self._work_backup = self._directory / _JOURNAL_WORK
        self.armed = False
        #: Set when the rollback itself fails — reported as a note on the original exception rather
        #: than raised, because losing the original failure would hide why the rebuild stopped.
        self.restore_failed: Exception | None = None

    @property
    def directory(self) -> Path:
        return self._directory

    def arm(self) -> bool:
        """Snapshot the previous rows and move the previous work directory aside.

        Returns whether anything was captured. Called BEFORE the delete, so a failure inside `arm`
        itself leaves the previous index untouched.
        """
        if count_rows_for_profile(self._connection, self._profile_id) == 0:
            return False

        if self._directory.exists():
            # A leftover journal is from a killed process; the run that is starting now supersedes
            # it, and keeping two generations would make "which one is the previous index?"
            # ambiguous at exactly the moment it matters.
            shutil.rmtree(self._directory)
        self._directory.mkdir(parents=True, exist_ok=True)

        with self._rows_path.open("w", encoding="utf-8", newline="\n") as handle:
            for row in iter_rows_for_profile(self._connection, self._profile_id):
                handle.write(json.dumps(list(row), ensure_ascii=False) + "\n")

        if self._work_dir.exists():
            os.replace(self._work_dir, self._work_backup)

        self.armed = True
        return True

    def roll_back(self) -> None:
        """Put the previous rows and the previous resume state back. Never raises."""
        if not self.armed:
            return
        try:
            with immediate_transaction(self._connection):
                delete_rows_for_profile(self._connection, self._profile_id)
                with self._rows_path.open("r", encoding="utf-8") as handle:
                    batch: list[tuple[str, str, str, int, str]] = []
                    for line in handle:
                        if not line.strip():
                            continue
                        values = json.loads(line)
                        batch.append(
                            (
                                str(values[0]),
                                str(values[1]),
                                str(values[2]),
                                int(values[3]),
                                str(values[4]),
                            )
                        )
                        if len(batch) >= 500:
                            insert_embedding_rows(self._connection, batch)
                            batch = []
                    if batch:
                        insert_embedding_rows(self._connection, batch)
            if self._work_backup.exists():
                if self._work_dir.exists():
                    shutil.rmtree(self._work_dir)
                os.replace(self._work_backup, self._work_dir)
            self.discard()
            self.armed = False
        except Exception as exc:  # pragma: no cover - the rollback of a rollback
            self.restore_failed = exc

    def discard(self) -> None:
        """Drop the journal: the rebuild succeeded, or its rollback has completed."""
        if self._directory.exists():
            shutil.rmtree(self._directory, ignore_errors=True)


def build_embeddings(
    corpus_path: Path,
    pinned: PinnedProfile,
    provider: EmbeddingProvider,
    runtime: Any,
    out_dir: Path,
    *,
    resume: bool = False,
    tiers: Sequence[str] | None = None,
    source_release_id: str | None = None,
    writer: VectorIndexWriter | None = None,
    connection: sqlite3.Connection | None = None,
) -> EmbeddingBuildResult:
    """Run the offline embedding build. See the module docstring for the ordering constraint.

    *provider* is POSITIONAL AND REQUIRED — no default, no fallback anywhere. A silent stub
    fallback would put unusable vectors into a signed release (the ticket's Reviewer-focus item).

    *writer* exists so tests can substitute the dependency-free `RecordingWriter`; production
    callers leave it `None` and get `UsearchIndexWriter`, which raises `VectorBackendUnavailable`
    when the backend is absent rather than degrading to some other format.
    """
    started = time.perf_counter()
    schema = load_contracts_schema()

    owns_connection = connection is None
    if connection is None:
        connection = schema.open_corpus_database(corpus_path, read_only=False)

    work_dir = work_directory_for(out_dir)
    resume_state_path = work_dir / _RESUME_STATE
    journal: _RebuildJournal | None = None
    publication = _Publication(work_dir / _PUBLICATION_BACKUP)

    try:
        provider_info = provider.describe()
        effective_profile = resolve_effective_profile(pinned.profile, provider_info)
        effective_runtime = stub_marked_runtime(runtime, provider_info)

        manifest_path = out_dir / MANIFEST_FILENAME
        vector_path = out_dir / VECTOR_FILENAME

        # Deliverable 6 runs BEFORE anything is written: a mixed index must never come into
        # existence, not even transiently.
        assert_profile_compatible(
            connection,
            effective_profile,
            manifest_path=manifest_path,
            model_artefact_sha256=provider_info.model_artefact.sha256,
            tokenizer_artifact_sha256=provider_info.tokenizer_artifact_sha256,
            runtime=effective_runtime,
        )

        # Steps 1 and 2 — eligibility, then the canonical order.
        selected_tiers = resolve_requested_tiers(tiers)
        selected = select_chunks(connection, selected_tiers)
        chunk_count = len(selected)

        if not resume:
            # A rebuild that is not a resume starts from a clean slate for this profile, rather
            # than colliding on the primary key half-way through. When that slate had something on
            # it, the journal captures it FIRST: a rebuild that fails after this delete must leave
            # the previously published index exactly as it found it, not an empty table beside a
            # manifest that still describes the rows it used to hold.
            journal = _RebuildJournal(connection, effective_profile.profile_id, out_dir)
            captured = journal.arm()
            with batch_transaction(connection):
                delete_rows_for_profile(connection, effective_profile.profile_id)
            if not captured and work_dir.exists():
                # Nothing to lose in the database, so the previous scratch space is simply stale.
                # (When the journal armed, it has already moved that directory aside.)
                shutil.rmtree(work_dir)

        state = _ResumeState.load(resume_state_path, effective_profile.dimensions)
        already = existing_chunk_ids(connection, effective_profile.profile_id) if resume else set()
        resumed_from = len(already) if resume else None

        stale: list[str] = []
        pending = []
        for chunk in selected:
            if chunk.search_chunk_id in already:
                if state.hashes.get(chunk.search_chunk_id) == chunk.text_hash:
                    continue
                stale.append(chunk.search_chunk_id)
            pending.append(chunk)

        if stale:
            with batch_transaction(connection):
                delete_rows_for_profile(connection, effective_profile.profile_id, stale)
            for chunk_id in stale:
                state.hashes.pop(chunk_id, None)
                state.records.pop(chunk_id, None)

        work_dir.mkdir(parents=True, exist_ok=True)
        sidecar = _Sidecar(work_dir / _SIDECAR, effective_profile.dimensions)

        # Step 3 + 5 — embed in batches, stage each vector, then persist the rows for that batch.
        embedded_count = 0
        for batch in iter_chunk_texts(connection, pending, effective_profile.batch_size):
            vectors = provider.embed([text for _, text in batch])
            if len(vectors) != len(batch):
                raise ValueError(f"provider returned {len(vectors)} vectors for {len(batch)} texts")
            rows: list[tuple[str, str, str, int, str]] = []
            staged: list[tuple[str, str, int]] = []
            for (chunk, _text), vector in zip(batch, vectors, strict=True):
                record = sidecar.append(vector)
                rows.append(
                    (
                        chunk.search_chunk_id,
                        effective_profile.profile_id,
                        vector_key_for(chunk.search_chunk_id),
                        effective_profile.dimensions,
                        effective_profile.quantisation,
                    )
                )
                staged.append((chunk.search_chunk_id, chunk.text_hash, record))
            with batch_transaction(connection):
                insert_embedding_rows(connection, rows)
            for chunk_id, text_hash, record in staged:
                state.hashes[chunk_id] = text_hash
                state.records[chunk_id] = record
            # Written AFTER the commit: a state file claiming work the database does not hold is
            # what would cause a resumed run to under-embed.
            state.write(resume_state_path)
            embedded_count += len(batch)

        # Step 4 — feed the index in the canonical order, from the sidecar. See the docstring.
        index_writer = (
            writer
            if writer is not None
            else UsearchIndexWriter(
                dimensions=effective_profile.dimensions,
                metric=effective_profile.distance_metric,
                quantisation=effective_profile.quantisation,
            )
        )
        for chunk in selected:
            record = state.records.get(chunk.search_chunk_id)
            if record is None:
                raise ValueError(
                    f"no staged vector for search_chunk {chunk.search_chunk_id!r}; the resume "
                    "state and the corpus disagree about what has been embedded"
                )
            index_writer.add(vector_key_for(chunk.search_chunk_id), sidecar.read(record))

        staged_vector = work_dir / VECTOR_FILENAME
        stat = index_writer.finalise(staged_vector)

        rows_for_profile = count_rows_for_profile(connection, effective_profile.profile_id)
        _assert_counts_agree(stat.count, rows_for_profile, effective_profile.profile_id)

        # Step 6 — the manifest, staged and then published.
        document = build_embedding_manifest(
            profile=effective_profile,
            model_artefact=(
                pinned.model_artifact if provider_info.kind == "local" else provider_info.model_artefact
            ),
            licence=pinned.licence,
            tokenizer_artifact_sha256=provider_info.tokenizer_artifact_sha256,
            runtime=effective_runtime,
            built_at=schema.utc_now(),
            tiers=selected_tiers,
            chunk_count=chunk_count,
            embedded_count=rows_for_profile,
            skipped_count=chunk_count - rows_for_profile,
            vector_file=stat,
            vector_path=VECTOR_FILENAME,
            source_release_id=source_release_id,
        )
        staged_manifest = work_dir / MANIFEST_FILENAME
        write_embedding_manifest(document, staged_manifest)

        measured = peak_rss()
        elapsed = time.perf_counter() - started
        result = EmbeddingBuildResult(
            embedded_count=embedded_count,
            skipped_count=chunk_count - rows_for_profile,
            vector_bytes=stat.byte_size,
            peak_rss_bytes=measured.bytes,
            elapsed_seconds=elapsed,
            chunks_per_second=(embedded_count / elapsed) if elapsed > 0 else 0.0,
            peak_rss_source=measured.source,
            resumed_from=resumed_from,
            profile_fingerprint=profile_fingerprint(effective_profile),
            chunk_count=chunk_count,
            vector_sha256=stat.sha256,
        )
        staged_report = work_dir / REPORT_FILENAME
        write_build_report(result, staged_report)

        # Publication — ONE group, under the publication lock. See the module docstring: the three
        # names move together or not at all, and the dual-index guard is re-run here because the
        # up-front check was a check-then-act.
        out_dir.mkdir(parents=True, exist_ok=True)
        with immediate_transaction(connection):
            assert_no_foreign_profiles(connection, effective_profile.profile_id)
            _assert_counts_agree(
                stat.count,
                count_rows_for_profile(connection, effective_profile.profile_id),
                effective_profile.profile_id,
            )
            publication.publish(staged_vector, vector_path)
            publication.publish(staged_manifest, manifest_path)
            publication.publish(staged_report, out_dir / REPORT_FILENAME)

        if journal is not None:
            journal.discard()
        # The work directory is KEPT, deliberately: it is what makes the PRD §12.1 incremental
        # re-embed possible (see the module docstring). It sits beside the bundle, not inside it,
        # so it adds no path to PRD §18.4's layout.
        shutil.rmtree(work_dir / _PUBLICATION_BACKUP, ignore_errors=True)
        return result
    except BaseException as exc:
        # Undo, in reverse order of destruction: the published group first, then the rows and the
        # resume state the rebuild displaced. A failed run leaves the previous index untouched.
        publication.roll_back()
        if journal is not None:
            journal.roll_back()
            if journal.restore_failed is not None:
                exc.add_note(
                    "the rebuild rollback ALSO failed, so chunk_embedding may still be missing the "
                    f"previous profile's rows; they are in {journal.directory / _JOURNAL_ROWS} "
                    f"(rollback error: {journal.restore_failed!r})"
                )
        raise
    finally:
        if owns_connection:
            connection.close()


def _assert_counts_agree(vector_count: int, row_count: int, profile_id: str) -> None:
    """Acceptance item 6, asserted in code and not only in a test.

    The manifest's vector count, the file on disk and the `chunk_embedding` row count are one
    number, or the build fails rather than publishing an artifact that describes a row set the
    database does not hold. Checked twice: once when the manifest's numbers are computed, and again
    under the publication lock, because between those two points another writer could have changed
    the table.
    """
    if vector_count != row_count:
        raise ValueError(
            f"the vector file holds {vector_count} vectors but chunk_embedding holds "
            f"{row_count} rows for profile_id={profile_id!r}"
        )
