"""The real `vectors.usearch` bytes (acceptance items 2 and 6) — behind an availability guard.

WHAT IS AND IS NOT DEFERRED HERE
---------------------------------
`usearch` and `numpy` are declared in `pipelines/embeddings/pyproject.toml` and present in the root
`uv.lock`, but `uv sync --frozen` installs neither: the root project is a virtual project
(`[tool.uv] package = false`) with empty `dependencies`, and a virtual workspace member's
dependencies are installed only if something depends on the member. Nothing does. The fix lives in
the root `pyproject.toml` / CI workflow, which are **FND-01/FND-02's** file-scope, not CRPS-05's.

So the skip below names its owner, exactly as the ticket's own `[fixture]` criterion does for a
genuinely-absent `CRPS-02` schema ("the test records a skip WITH A MESSAGE NAMING `CRPS-02` rather
than passing silently"). That device is the ticket's, reused for the same reason.

Everything the skip would otherwise hide is covered dependency-free elsewhere — `RecordingWriter`
proves determinism, ordering, counting, resume and atomicity over its own serialisation — so only
the FINAL BYTE-LEVEL assertion is deferred, never a criterion. And the `threads=1` requirement, on
which the whole determinism argument rests, is asserted by SOURCE SCAN in
`test_embed_source_scan.py`, which runs unconditionally.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

FND01_SKIP = (
    "usearch is not installed; workspace-member dependencies are not installed by "
    "`uv sync --frozen` in this repository's virtual-root uv layout (the root project is virtual "
    "with empty dependencies and nothing depends on pipelines/embeddings). FND-01/FND-02 own the "
    "fix in the root pyproject.toml / CI workflow; CRPS-05 declares the pins in the member "
    "pyproject.toml and regenerates uv.lock. The logic these assertions cover is proven "
    "dependency-free in test_embed_determinism.py and test_embed_eligibility.py."
)

pytest.importorskip("usearch", reason=FND01_SKIP)
pytest.importorskip("numpy", reason=FND01_SKIP)

from contracts.schema import open_corpus_database  # noqa: E402
from embedding_fixtures import CorpusFixture, build_corpus  # noqa: E402
from embeddings.build import build_embeddings  # noqa: E402
from embeddings.emit import MANIFEST_FILENAME, VECTOR_FILENAME  # noqa: E402
from embeddings.profile import PinnedProfile  # noqa: E402
from embeddings.provider import DeterministicStubProvider  # noqa: E402


def _stub(pinned: PinnedProfile) -> DeterministicStubProvider:
    return DeterministicStubProvider(seed=pinned.profile.seed, dimensions=pinned.profile.dimensions)


def test_two_builds_produce_a_byte_identical_vector_file(
    tmp_path: Path, pinned_profile: PinnedProfile, runtime_pin_fixture
) -> None:
    """The determinism criterion, on the artifact that is actually signed."""
    digests = []
    for label in ("a", "b"):
        corpus = build_corpus(tmp_path / label / "corpus.sqlite")
        out = tmp_path / f"out-{label}"
        build_embeddings(corpus.path, pinned_profile, _stub(pinned_profile), runtime_pin_fixture, out)
        digests.append(hashlib.sha256((out / VECTOR_FILENAME).read_bytes()).hexdigest())
    assert digests[0] == digests[1]


def test_the_manifest_describes_the_file_on_disk_and_the_row_count(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, out_dir: Path
) -> None:
    """Acceptance item 6, against real USearch bytes rather than the fake's serialisation."""
    build_embeddings(
        corpus_fixture.path, pinned_profile, _stub(pinned_profile), runtime_pin_fixture, out_dir
    )
    document = json.loads((out_dir / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    data = (out_dir / VECTOR_FILENAME).read_bytes()

    assert document["vector_file"]["path"] == VECTOR_FILENAME
    assert document["vector_file"]["sha256"] == hashlib.sha256(data).hexdigest()
    assert document["vector_file"]["byte_size"] == len(data)

    connection = open_corpus_database(corpus_fixture.path)
    try:
        rows = connection.execute(
            "SELECT COUNT(*) FROM chunk_embedding WHERE profile_id = ?",
            (pinned_profile.profile.profile_id,),
        ).fetchone()[0]
    finally:
        connection.close()
    assert document["vector_file"]["count"] == rows


def test_a_failed_run_leaves_no_partial_vector_file(
    corpus_fixture: CorpusFixture, pinned_profile: PinnedProfile, runtime_pin_fixture, tmp_path: Path
) -> None:
    """The temp-file-then-rename pattern, on the real writer (test plan step 10)."""
    from typing import Sequence

    from embeddings.provider import ProviderInfo, VectorBatch

    class Exploding:
        def __init__(self, inner: DeterministicStubProvider) -> None:
            self._inner = inner
            self._calls = 0

        def embed(self, texts: Sequence[str]) -> VectorBatch:
            self._calls += 1
            if self._calls > 1:
                raise RuntimeError("boom")
            return self._inner.embed(texts)

        def describe(self) -> ProviderInfo:
            return self._inner.describe()

    out = tmp_path / "out"
    with pytest.raises(RuntimeError):
        build_embeddings(
            corpus_fixture.path,
            pinned_profile,
            Exploding(_stub(pinned_profile)),
            runtime_pin_fixture,
            out,
        )
    assert not (out / VECTOR_FILENAME).exists()
    assert not (out / MANIFEST_FILENAME).exists()


def test_the_backend_refuses_an_unknown_metric_or_quantisation() -> None:
    from embeddings.vectors import UsearchIndexWriter

    with pytest.raises(ValueError):
        UsearchIndexWriter(dimensions=8, metric="hamming", quantisation="none")
    with pytest.raises(ValueError):
        UsearchIndexWriter(dimensions=8, metric="cosine", quantisation="float128")


def test_the_writer_rejects_a_vector_of_the_wrong_width() -> None:
    import array

    from embeddings.vectors import UsearchIndexWriter

    writer = UsearchIndexWriter(dimensions=8, metric="cosine", quantisation="none")
    with pytest.raises(ValueError):
        writer.add("sc_x", array.array("f", [0.0] * 4))
