"""Peak resident-set measurement, in bytes, on every platform this repository runs on.

The ticket requires the 10,000-chunk run's peak RSS to be asserted against a declared ceiling and
recorded in `embedding-build-report.json`, and says to "declare the chosen mechanism in the test".
There is no single mechanism:

* POSIX (CI is `ubuntu-latest`): `resource.getrusage(RUSAGE_SELF).ru_maxrss`. The unit differs by
  platform — KiB on Linux, BYTES on macOS — and normalising it is the whole reason this is not a
  one-liner at the call site.
* Windows (the development machine): `kernel32.K32GetProcessMemoryInfo` ->
  `PROCESS_MEMORY_COUNTERS.PeakWorkingSetSize`, in bytes. `resource` does not exist here and
  `psutil` is not installed (and cannot be — see `vectors.py` on the FND-01 dependency gap).
* Neither: `tracemalloc`'s peak, which measures Python allocations only and is therefore an
  UNDERCOUNT. It is reported under its own `peak_rss_source` value so nobody reads it as an RSS.

`peak_rss_source` travels into the build report alongside the number precisely so a reviewer can
tell a real measurement from a fallback. A number whose provenance is unknown is not evidence.

Both figures are peaks for the WHOLE PROCESS, so a test that wants to measure a build's peak has to
run it in a subprocess — otherwise it measures pytest.
"""

from __future__ import annotations

import sys
import tracemalloc
from dataclasses import dataclass

__all__ = ["PeakMemory", "peak_rss"]


@dataclass(frozen=True)
class PeakMemory:
    """Peak memory in BYTES, plus the mechanism that produced it."""

    bytes: int
    source: str


def _windows_peak() -> PeakMemory | None:
    if sys.platform != "win32":
        return None
    try:
        import ctypes
        from ctypes import wintypes
    except ImportError:  # pragma: no cover - ctypes is always present on win32
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
        # Without this the handle is truncated to a C int and the call silently reports 0.
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        # K32GetProcessMemoryInfo lives in kernel32; the psapi.dll spelling is not always present.
        counters = _ProcessMemoryCounters()
        counters.cb = ctypes.sizeof(_ProcessMemoryCounters)
        ok = kernel32.K32GetProcessMemoryInfo(
            kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb
        )
    except (AttributeError, OSError):  # pragma: no cover - platform-dependent
        return None
    if not ok or counters.PeakWorkingSetSize <= 0:  # pragma: no cover - platform-dependent
        return None
    return PeakMemory(bytes=int(counters.PeakWorkingSetSize), source="kernel32.PeakWorkingSetSize")


def _posix_peak() -> PeakMemory | None:
    try:
        import resource
    except ImportError:
        return None
    raw = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if raw <= 0:  # pragma: no cover - platform-dependent
        return None
    if sys.platform == "darwin":
        return PeakMemory(bytes=int(raw), source="getrusage.ru_maxrss(bytes)")
    # Linux reports KiB. Normalising here is what keeps `peak_rss_bytes` meaning bytes everywhere.
    return PeakMemory(bytes=int(raw) * 1024, source="getrusage.ru_maxrss(kib)")


def peak_rss() -> PeakMemory:
    """Peak resident set of THIS process, in bytes, with its mechanism named."""
    for probe in (_posix_peak, _windows_peak):
        measured = probe()
        if measured is not None:
            return measured
    # Last resort: Python allocations only, so an undercount. Named as such, never as an RSS.
    _, peak = tracemalloc.get_traced_memory() if tracemalloc.is_tracing() else (0, 0)
    return PeakMemory(bytes=int(peak), source="tracemalloc.peak(undercount)")
