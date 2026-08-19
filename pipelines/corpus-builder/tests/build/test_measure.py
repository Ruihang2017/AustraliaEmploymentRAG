"""`measure.py` records sizes and peak RSS, with the peak's provenance attached."""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path

from candidate_paths import SRC  # noqa: F401

from build.measure import Measurements, measure, measure_peak_rss, path_bytes


@dataclass
class _Paths:
    bundle_dir: Path
    corpus_db: Path
    lexical_index_dir: Path
    vector_index: Path


def test_path_bytes_handles_files_directories_and_absence(tmp_path: Path) -> None:
    (tmp_path / "a.bin").write_bytes(b"0123456789")
    directory = tmp_path / "dir"
    directory.mkdir()
    (directory / "b.bin").write_bytes(b"01234")
    assert path_bytes(tmp_path / "a.bin") == 10
    assert path_bytes(directory) == 5
    assert path_bytes(tmp_path / "absent") == 0


def test_measure_reports_every_deliverable_9_member(tmp_path: Path) -> None:
    bundle = tmp_path / "bundle"
    (bundle / "tantivy").mkdir(parents=True)
    (bundle / "corpus.sqlite").write_bytes(b"x" * 100)
    (bundle / "tantivy" / "seg.bin").write_bytes(b"y" * 50)
    (bundle / "vectors.usearch").write_bytes(b"z" * 25)

    started = time.monotonic()
    measured = measure(
        _Paths(
            bundle_dir=bundle,
            corpus_db=bundle / "corpus.sqlite",
            lexical_index_dir=bundle / "tantivy",
            vector_index=bundle / "vectors.usearch",
        ),
        started_monotonic=started,
    )
    assert isinstance(measured, Measurements)
    assert measured.corpus_sqlite_bytes == 100
    assert measured.lexical_index_bytes == 50
    assert measured.vector_index_bytes == 25
    assert measured.total_bundle_bytes == 175
    assert measured.build_seconds >= 0
    document = measured.to_dict()
    assert set(document) == {
        "corpus_sqlite_bytes",
        "lexical_index_bytes",
        "vector_index_bytes",
        "total_bundle_bytes",
        "build_seconds",
        "peak_rss_bytes",
        "peak_rss_source",
    }


def test_peak_rss_carries_its_provenance() -> None:
    """Under pytest the figure is pytest's, so presence and PROVENANCE are what is assertable —
    a number whose mechanism is unknown is not evidence, which is why `peak_rss_source` exists."""
    peak_bytes, source = measure_peak_rss()
    assert peak_bytes >= 0
    assert source in {
        "getrusage.ru_maxrss(kib)",
        "getrusage.ru_maxrss(bytes)",
        "kernel32.PeakWorkingSetSize",
        "tracemalloc.peak(undercount)",
    }
