"""Determinism (CRPS-05 acceptance item 2; test plan step 2).

Three separate properties, because they fail independently:

1. Two builds of the same corpus with the same profile produce identical vectors and identical
   manifests apart from `built_at`.
2. The stub provider produces identical output ACROSS OS PROCESSES. Only a subprocess test can
   catch a `hash()`/PYTHONHASHSEED dependency — in one process the seed is fixed for the run, so an
   in-process comparison would pass while a rebuild on another day differed.
3. The output does not depend on the physical order `search_chunk` rows were inserted in. This is
   the ticket's "the on-disk vector order must not depend on database iteration order" and the
   Reviewer-focus item that goes with it.

The byte-level assertion on a real `vectors.usearch` lives in `test_embed_vector_file.py`, behind
the backend-availability guard; here the same property is proven against `RecordingWriter`'s own
deterministic serialisation, so nothing is left unproven when the guard skips.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

from embedding_fixtures import CorpusFixture, RecordingWriter, build_corpus
from embeddings.build import build_embeddings
from embeddings.emit import MANIFEST_FILENAME
from embeddings.profile import PinnedProfile
from embeddings.provider import DeterministicStubProvider


def _build(corpus: CorpusFixture, pinned: PinnedProfile, runtime, out: Path):
    writer = RecordingWriter()
    result = build_embeddings(
        corpus.path,
        pinned,
        DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions),
        runtime,
        out,
        writer=writer,
    )
    return result, writer


def _manifest_without_timestamp(out: Path) -> dict:
    document = json.loads((out / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    document.pop("built_at")
    return document


def test_two_runs_produce_identical_vectors_and_manifests(
    tmp_path: Path, pinned_profile: PinnedProfile, runtime_pin_fixture
) -> None:
    first_corpus = build_corpus(tmp_path / "a" / "corpus.sqlite")
    second_corpus = build_corpus(tmp_path / "b" / "corpus.sqlite")

    _, first_writer = _build(first_corpus, pinned_profile, runtime_pin_fixture, tmp_path / "out-a")
    _, second_writer = _build(second_corpus, pinned_profile, runtime_pin_fixture, tmp_path / "out-b")

    assert first_writer.calls == second_writer.calls
    assert (tmp_path / "out-a" / "vectors.usearch").read_bytes() == (
        tmp_path / "out-b" / "vectors.usearch"
    ).read_bytes()
    assert _manifest_without_timestamp(tmp_path / "out-a") == _manifest_without_timestamp(
        tmp_path / "out-b"
    )


def test_only_built_at_may_differ_between_two_runs(
    tmp_path: Path, pinned_profile: PinnedProfile, runtime_pin_fixture
) -> None:
    """The removed member must really be the ONLY one that is allowed to move."""
    first_corpus = build_corpus(tmp_path / "a" / "corpus.sqlite")
    second_corpus = build_corpus(tmp_path / "b" / "corpus.sqlite")
    _build(first_corpus, pinned_profile, runtime_pin_fixture, tmp_path / "out-a")
    _build(second_corpus, pinned_profile, runtime_pin_fixture, tmp_path / "out-b")

    left = json.loads((tmp_path / "out-a" / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    right = json.loads((tmp_path / "out-b" / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    differing = {key for key in left if left[key] != right.get(key)}
    assert differing <= {"built_at"}


def test_vector_order_is_independent_of_row_insertion_order(
    tmp_path: Path, pinned_profile: PinnedProfile, runtime_pin_fixture
) -> None:
    forward = build_corpus(tmp_path / "fwd" / "corpus.sqlite", insertion_order="document")
    reverse = build_corpus(tmp_path / "rev" / "corpus.sqlite", insertion_order="reverse")
    assert forward.insertion_order != reverse.insertion_order  # the fixture really did differ

    _, forward_writer = _build(forward, pinned_profile, runtime_pin_fixture, tmp_path / "out-fwd")
    _, reverse_writer = _build(reverse, pinned_profile, runtime_pin_fixture, tmp_path / "out-rev")

    assert forward_writer.calls == reverse_writer.calls
    assert (tmp_path / "out-fwd" / "vectors.usearch").read_bytes() == (
        tmp_path / "out-rev" / "vectors.usearch"
    ).read_bytes()


def test_vector_order_is_the_canonical_chunk_order(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """`vector_key` is the search_chunk id, in (node_version_id, chunk_ordinal) order."""
    _, writer = _build(corpus_fixture, pinned_profile, runtime_pin_fixture, out_dir)
    from contracts.schema import open_corpus_database

    connection = open_corpus_database(corpus_fixture.path)
    try:
        ordering = {
            row[0]: (row[1], row[2])
            for row in connection.execute(
                "SELECT id, node_version_id, chunk_ordinal FROM search_chunk"
            )
        }
    finally:
        connection.close()
    keys = list(writer.keys)
    assert keys == sorted(keys, key=lambda key: ordering[key])


# ==================================================================================================
# Cross-process determinism — the only way to catch a PYTHONHASHSEED dependency
# ==================================================================================================

_PROBE = textwrap.dedent(
    """
    import hashlib, json, sys
    sys.path.insert(0, sys.argv[1])
    from embeddings.provider import DeterministicStubProvider

    vectors = DeterministicStubProvider(seed=20260803, dimensions=16).embed(
        ["alpha", "b\\u00eata", "\\U0001d54f non-BMP", ""]
    )
    payload = json.dumps([list(map(float, v)) for v in vectors], sort_keys=True)
    print(hashlib.sha256(payload.encode("utf-8")).hexdigest())
    """
)


def test_stub_provider_is_deterministic_across_processes(tmp_path: Path) -> None:
    probe = tmp_path / "probe_stub.py"
    probe.write_text(_PROBE, encoding="utf-8")
    source_root = str(Path(__file__).resolve().parents[1] / "src")

    digests = []
    for hash_seed in ("0", "1", "12345"):
        # A different PYTHONHASHSEED per process: identical output here means nothing in the stub
        # depends on `hash()`, which an in-process comparison could never establish.
        completed = subprocess.run(
            [sys.executable, str(probe), source_root],
            capture_output=True,
            text=True,
            check=True,
            env={"PATH": "", "SYSTEMROOT": "", "PYTHONHASHSEED": hash_seed, "PYTHONIOENCODING": "utf-8"},
        )
        digests.append(completed.stdout.strip())

    assert len(set(digests)) == 1, f"stub output differed across processes: {digests}"
