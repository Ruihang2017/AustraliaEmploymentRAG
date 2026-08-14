"""Peak memory over a 10,000-chunk stub run (acceptance item 12; test plan step 8).

THE MECHANISM, DECLARED as the ticket requires: `memory.peak_rss()` uses
`resource.getrusage(RUSAGE_SELF).ru_maxrss` on POSIX (KiB on Linux, bytes on macOS, normalised to
bytes) and `kernel32.K32GetProcessMemoryInfo` -> `PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize` on
Windows. `psutil` is deliberately not used: it is not installed and cannot be, for the same
FND-01 reason as `usearch`. Whichever ran is recorded as `peak_rss_source` in
`embedding-build-report.json`, so a fallback can never be mistaken for a measurement.

THE RUN HAPPENS IN A SUBPROCESS. Both mechanisms report the peak for the WHOLE PROCESS, so an
in-process assertion would measure pytest's own peak — which is both larger and unrelated. That is
not a detail: an in-process version of this test would pass or fail according to which other tests
ran first. Subprocess-spawning tests are established here (`test_canonical_subprocess.py`).
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

#: The declared ceiling, in bytes. 10,000 chunks x 8 float32 components is ~320 KiB of vector data;
#: everything above that is the interpreter, sqlite3 and the fixture. The figure is generous
#: because it is a REGRESSION ceiling, not a target: PRD §19.1's 2 GB production host never runs
#: this pipeline (PRD §19.3), and the real budget question is breakdown plan §8 Q3, deferred to
#: RLSE-11 against measured numbers. What this catches is an edit that materialises the whole
#: corpus's text or vectors instead of streaming batches.
PEAK_RSS_CEILING_BYTES = 700 * 1024 * 1024

CHUNK_TARGET = 10_000

_PROBE = textwrap.dedent(
    """
    import json, sys, unicodedata
    from pathlib import Path

    repo_root, work, chunk_target = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
    sys.path.insert(0, str(repo_root / "pipelines" / "embeddings" / "src"))
    sys.path.insert(0, str(repo_root / "pipelines" / "corpus-builder" / "src"))
    sys.path.insert(0, str(repo_root / "pipelines" / "embeddings" / "tests"))

    from contracts.schema import create_corpus_database, open_corpus_database
    from contracts.validate import sha256_hex
    from embedding_fixtures import (
        RUNTIME_PIN_DOCUMENT, TS, make_profile, seed_single_node_document,
    )
    from embeddings.build import build_embeddings
    from embeddings.profile import (
        LicencePin, ModelArtefactPin, PinnedProfile, runtime_pin_from_dict,
    )
    from embeddings.provider import DeterministicStubProvider
    from embeddings.report import REPORT_FILENAME

    # A wide, synthetic corpus: one node holding chunk_target chunks' worth of text, so the run is
    # about VOLUME rather than about the fixture builder.
    corpus = work / "corpus.sqlite"
    create_corpus_database(corpus)
    connection = open_corpus_database(corpus, read_only=False)
    span = 64
    text = "".join(f"clause {index:07d} of the synthetic memory fixture ; " for index in range(chunk_target))
    text = unicodedata.normalize("NFC", text)

    node_version_id = seed_single_node_document(connection, text)

    connection.execute("BEGIN")
    for ordinal in range(chunk_target):
        start, end = ordinal * span, (ordinal + 1) * span
        connection.execute(
            "INSERT INTO search_chunk (id, node_version_id, chunk_ordinal, start_offset,"
            " end_offset, text_hash, index_tier, created_at) VALUES (?, ?, ?, ?, ?, ?,"
            " 'TIER_1_FULL_SEMANTIC', ?)",
            (f"sc_{ordinal:06d}", node_version_id, ordinal, start, end,
             sha256_hex(text[start:end]), TS))
    connection.execute("COMMIT")
    connection.close()

    profile = make_profile(batch_size=256)
    pinned = PinnedProfile(
        profile=profile,
        model_artifact=ModelArtefactPin(sha256="a" * 64, byte_size=1, format="stub"),
        licence=LicencePin(
            identifier="CC0-1.0", url=None, attribution_required=False,
            redistribution_permitted=True, notes=None,
        ),
        tokenizer_artifact_sha256="b" * 64,
    )

    class Fake:
        def add(self, vector_key, vector): pass
        def finalise(self, path):
            from embeddings.vectors import VectorFileStat
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"")
            return VectorFileStat(sha256="0" * 64, byte_size=0, count=chunk_target)

    out = work / "out"
    result = build_embeddings(
        corpus, pinned,
        DeterministicStubProvider(seed=profile.seed, dimensions=profile.dimensions),
        runtime_pin_from_dict(dict(RUNTIME_PIN_DOCUMENT)),
        out, writer=Fake(),
    )
    report = json.loads((out / REPORT_FILENAME).read_text(encoding="utf-8"))
    print(json.dumps({
        "embedded_count": result.embedded_count,
        "peak_rss_bytes": result.peak_rss_bytes,
        "peak_rss_source": result.peak_rss_source,
        "report_peak_rss_bytes": report["peak_rss_bytes"],
        "report_peak_rss_source": report["peak_rss_source"],
        "chunks_per_second": result.chunks_per_second,
    }))
    """
)


@pytest.fixture(scope="module")
def measurement(tmp_path_factory) -> dict:
    work = tmp_path_factory.mktemp("memory")
    probe = work / "probe_memory_ceiling.py"
    probe.write_text(_PROBE, encoding="utf-8")
    repo_root = Path(__file__).resolve().parents[3]

    completed = subprocess.run(
        [sys.executable, str(probe), str(repo_root), str(work), str(CHUNK_TARGET)],
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert completed.returncode == 0, completed.stderr[-4000:]
    return json.loads(completed.stdout.strip().splitlines()[-1])


def test_ten_thousand_chunks_are_embedded(measurement: dict) -> None:
    assert measurement["embedded_count"] == CHUNK_TARGET


def test_peak_rss_stays_below_the_declared_ceiling(measurement: dict) -> None:
    peak = measurement["peak_rss_bytes"]
    assert 0 < peak < PEAK_RSS_CEILING_BYTES, (
        f"peak RSS {peak} bytes ({peak / 1024 / 1024:.1f} MiB) exceeded the declared ceiling "
        f"{PEAK_RSS_CEILING_BYTES} bytes; the build is probably materialising the corpus rather "
        f"than streaming batches. Mechanism: {measurement['peak_rss_source']}"
    )


def test_the_build_report_records_the_measurement_and_its_mechanism(measurement: dict) -> None:
    assert measurement["report_peak_rss_bytes"] == measurement["peak_rss_bytes"]
    assert measurement["report_peak_rss_source"] == measurement["peak_rss_source"]


def test_the_mechanism_is_a_real_rss_measurement_not_the_fallback(measurement: dict) -> None:
    """A tracemalloc peak is an undercount and must not be read as an RSS.

    If this ever fails on a new platform, the honest response is to add a mechanism to
    `memory.py` — not to widen the ceiling until the undercount fits under it.
    """
    assert measurement["peak_rss_source"] in {
        "getrusage.ru_maxrss(kib)",
        "getrusage.ru_maxrss(bytes)",
        "kernel32.PeakWorkingSetSize",
    }


def test_throughput_is_reported(measurement: dict) -> None:
    """Deliverable 7's `chunks_per_second`, the Q5/GOLD-16 evidence."""
    assert measurement["chunks_per_second"] > 0
