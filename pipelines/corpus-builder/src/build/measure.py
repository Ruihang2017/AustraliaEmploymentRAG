"""Measured build figures for the gate report (CRPS-06 deliverable 9).

PRD §40.8 item 12 applies "measured storage, parse time, index size and peak memory" to an adapter;
this module applies the same discipline to the release build. `RLSE-11` (the 2 GB real-scale
benchmark) consumes these numbers, and they are the measured EVIDENCE for breakdown plan §8 Q3/Q5 —
both deferred until measurement. They are never a restatement of the PRD's planning hypotheses.

WHY THE PEAK-RSS CODE IS DUPLICATED FROM `pipelines/embeddings/src/embeddings/memory.py` INSTEAD OF
IMPORTED. Importing it would create a `corpus-builder -> embeddings` PRODUCTION import. Today the
dependency runs the other way (`embeddings` imports `manifest`), and adding the reverse edge would
make the two packages mutually dependent — for sixty lines of platform detection. The mechanism is
attributed here, and `peak_rss_source` is carried into the report for the same reason CRPS-05 carries
it: a number whose provenance is unknown is not evidence.

PEAK RSS IS A WHOLE-PROCESS FIGURE. Measured under pytest it measures pytest, so the tests assert
presence and provenance, and the meaningful number comes from a CLI run.
"""

from __future__ import annotations

import sys
import time
import tracemalloc
from dataclasses import dataclass
from pathlib import Path
from typing import Any

__all__ = ["Measurements", "directory_bytes", "measure_peak_rss", "path_bytes"]


def path_bytes(path: Path) -> int:
    """Byte size of a file, a directory tree, or an absent path (0). Symlinks are never followed."""
    target = Path(path)
    if target.is_symlink() or not target.exists():
        return 0
    if target.is_file():
        return target.stat().st_size
    return sum(
        item.stat().st_size
        for item in target.rglob("*")
        if item.is_file() and not item.is_symlink()
    )


def directory_bytes(path: Path) -> int:
    return path_bytes(path)


def _windows_peak() -> tuple[int, str] | None:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes
    except ImportError:  # pragma: no cover — ctypes is always present on win32
        return None

    class _ProcessMemoryCounters(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
        ]

    try:
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        # Without an explicit restype the pseudo-handle is truncated to a C int and the call fails
        # to marshal; without argtypes the HANDLE raises `OverflowError: int too long to convert`.
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        kernel32.K32GetProcessMemoryInfo.argtypes = [
            wintypes.HANDLE,
            ctypes.POINTER(_ProcessMemoryCounters),
            wintypes.DWORD,
        ]
        kernel32.K32GetProcessMemoryInfo.restype = wintypes.BOOL
        counters = _ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(_ProcessMemoryCounters)
        ok = kernel32.K32GetProcessMemoryInfo(
            kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb
        )
    except (AttributeError, OSError):  # pragma: no cover — platform-dependent
        return None
    if not ok or counters.PeakWorkingSetSize <= 0:  # pragma: no cover — platform-dependent
        return None
    return int(counters.PeakWorkingSetSize), "kernel32.PeakWorkingSetSize"


def _posix_peak() -> tuple[int, str] | None:
    try:
        import resource
    except ImportError:
        return None
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if raw <= 0:  # pragma: no cover — platform-dependent
        return None
    if sys.platform == "darwin":
        return int(raw), "getrusage.ru_maxrss(bytes)"
    # Linux reports KiB; normalising here is what keeps `peak_rss_bytes` meaning bytes everywhere.
    return int(raw) * 1024, "getrusage.ru_maxrss(kib)"


def measure_peak_rss() -> tuple[int, str]:
    """`(bytes, source)` peak resident set of THIS process, with its mechanism named."""
    for probe in (_posix_peak, _windows_peak):
        measured = probe()
        if measured is not None:
            return measured
    _, peak = tracemalloc.get_traced_memory() if tracemalloc.is_tracing() else (0, 0)
    # Python allocations only, so an UNDERCOUNT. Named as such, never as an RSS.
    return int(peak), "tracemalloc.peak(undercount)"


@dataclass(frozen=True)
class Measurements:
    """Deliverable 9's six members, plus the provenance of the sixth."""

    corpus_sqlite_bytes: int
    lexical_index_bytes: int
    vector_index_bytes: int
    total_bundle_bytes: int
    build_seconds: float
    peak_rss_bytes: int
    peak_rss_source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "corpus_sqlite_bytes": self.corpus_sqlite_bytes,
            "lexical_index_bytes": self.lexical_index_bytes,
            "vector_index_bytes": self.vector_index_bytes,
            "total_bundle_bytes": self.total_bundle_bytes,
            "build_seconds": round(self.build_seconds, 3),
            "peak_rss_bytes": self.peak_rss_bytes,
            "peak_rss_source": self.peak_rss_source,
        }


def measure(paths: Any, *, started_monotonic: float) -> Measurements:
    """Measure the staged bundle. Call it AFTER the manifest is written, so the sizes are final."""
    peak_bytes, peak_source = measure_peak_rss()
    return Measurements(
        corpus_sqlite_bytes=path_bytes(paths.corpus_db),
        lexical_index_bytes=path_bytes(paths.lexical_index_dir),
        vector_index_bytes=path_bytes(paths.vector_index),
        total_bundle_bytes=path_bytes(paths.bundle_dir),
        build_seconds=max(time.monotonic() - started_monotonic, 0.0),
        peak_rss_bytes=peak_bytes,
        peak_rss_source=peak_source,
    )
