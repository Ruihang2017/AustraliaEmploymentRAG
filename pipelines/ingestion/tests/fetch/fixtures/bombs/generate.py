"""Regenerate the decompression-bomb fixtures (SEC-002 evidence).

Run manually from the repository root:

    uv run python pipelines/ingestion/tests/fetch/fixtures/bombs/generate.py

Standard library only, and deterministic: the same input produces byte-identical output, so
`test_bombs.py` can pin each fixture's SHA-256 and a regenerated fixture cannot drift silently.

The files are small ON PURPOSE — a few KiB each. That IS the attack: highly repetitive input
compresses enormously, so a couple of KiB on the wire becomes megabytes in memory. Committing an
actually-10-GiB expansion would be pointless (git would carry ~10 MiB) when the same control is
proved by a fixture whose expansion is orders of magnitude above the ceiling the test sets.
"""

from __future__ import annotations

import gzip
import hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent

#: A run of one repeated byte: the classic gzip bomb shape, ratio in the hundreds.
ABSOLUTE_PLAIN = b"\x00" * (8 * 1024 * 1024)

#: Slightly less compressible, so the ratio guard rather than the absolute cap is what fires in the
#: test that exercises it.
RATIO_PLAIN = (b"taxrag-ratio-abuse-fixture-" * 4 + b"\n") * 60_000


def _write(name: str, plain: bytes) -> None:
    target = HERE / name
    # mtime=0 keeps the gzip header — and therefore the file's SHA-256 — deterministic.
    target.write_bytes(gzip.compress(plain, compresslevel=9, mtime=0))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    print(f"{name}: {target.stat().st_size} bytes compressed, {len(plain)} plain, sha256 {digest}")


if __name__ == "__main__":
    _write("gzip-absolute.bin.gz", ABSOLUTE_PLAIN)
    _write("ratio-abuse.gz", RATIO_PLAIN)
