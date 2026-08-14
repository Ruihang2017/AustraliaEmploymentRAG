"""`build_embeddings()` — the entry point, and the ordering constraint it must honour.

THE SEVEN STEPS, IN THIS ORDER (deliverable 3):

    1. select chunks whose tier satisfies CRPS-04's `is_eligible_for_dense()`
    2. order the selection deterministically by (node_version_id, chunk_ordinal)
    3. embed in batches of `profile.batch_size`, with bounded peak memory
    4. write vectors into the USearch index file, vector_key = f"{search_chunk_id}"
    5. write chunk_embedding rows — the PRD §35.3 five columns and nothing else
    6. emit embedding-manifest.json
    7. return counts, elapsed time, peak RSS, and the output file's sha256/byte size

STEPS 4-6 ARE ALL-OR-NOTHING. Everything is produced under a private work directory
(`<out>/.embedding-work/`); the three published artifacts appear at their final paths only at the
very end, each by `os.replace`, and the work directory is removed once they have. On any exception
nothing partial exists at a final path, while an interrupted run still has its resume state. A
leftover work directory can never be mistaken for output: its name is none of PRD §18.4's three.

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
from .guard import assert_profile_compatible
from .memory import peak_rss
from .persist import (
    batch_transaction,
    count_rows_for_profile,
    delete_rows_for_profile,
    existing_chunk_ids,
    insert_embedding_rows,
)
from .profile import PinnedProfile, profile_fingerprint, resolve_effective_profile
from .provider import EmbeddingProvider
from .report import REPORT_FILENAME, EmbeddingBuildResult, write_build_report
from .selection import iter_chunk_texts, resolve_requested_tiers, select_chunks
from .vectors import UsearchIndexWriter, VectorIndexWriter

__all__ = ["WORK_DIRNAME", "build_embeddings", "vector_key_for"]

#: Private to a build. Deliberately NOT one of PRD §18.4's three published names.
WORK_DIRNAME = ".embedding-work"
_RESUME_STATE = "resume-state.json"
_SIDECAR = "vectors.partial.bin"


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

    work_dir = out_dir / WORK_DIRNAME
    resume_state_path = work_dir / _RESUME_STATE

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
            # than colliding on the primary key half-way through.
            with batch_transaction(connection):
                delete_rows_for_profile(connection, effective_profile.profile_id)
            if work_dir.exists():
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
        if stat.count != rows_for_profile:
            # Acceptance item 6, asserted in code and not only in a test: the manifest's vector
            # count, the file on disk and the `chunk_embedding` row count are one number, or the
            # build fails rather than describing an artifact that does not exist.
            raise ValueError(
                f"the vector file holds {stat.count} vectors but chunk_embedding holds "
                f"{rows_for_profile} rows for profile_id={effective_profile.profile_id!r}"
            )

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

        # Publication. Three `os.replace` calls, only after every failure mode above has passed.
        out_dir.mkdir(parents=True, exist_ok=True)
        os.replace(staged_vector, vector_path)
        os.replace(staged_manifest, manifest_path)
        os.replace(staged_report, out_dir / REPORT_FILENAME)
        # The work directory has served its purpose; leaving it inside the bundle root would add a
        # path PRD §18.4's layout does not list.
        shutil.rmtree(work_dir, ignore_errors=True)
        return result
    finally:
        if owns_connection:
            connection.close()
