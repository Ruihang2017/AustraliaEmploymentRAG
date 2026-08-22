"""Bounded transport decompression (INGF-02 deliverable 3 step 6; PRD §37.4, SEC-002).

PRD §37.4 caps the "safely decompressed" size at 250 MiB, and SEC-002's minimum acceptance evidence
is that the decompression-bomb suite passes. The word that matters is **safely**: a decoder that
decompresses first and checks afterwards has already spent the memory the cap exists to protect, so
this decoder never produces more than the remaining allowance in one call.
`zlib.decompressobj().decompress(data, max_length=n)` bounds the output per call and leaves the
remainder in `unconsumed_tail`; that is the whole mechanism.

TWO INDEPENDENT ABORTS, both `FETCH_DECOMPRESSION_LIMIT`:

1. the absolute cap — total decompressed bytes above `max_decompressed_bytes`;
2. the ratio guard — decompressed/compressed above `max_compression_ratio`, which catches a bomb
   that is still below the absolute cap. It is evaluated only once enough compressed input has
   been consumed (`RATIO_GUARD_MIN_COMPRESSED_BYTES`), because a gzip header alone expands to
   nothing and would otherwise trip the guard on every response.

`br` IS NEVER REQUESTED. The standard library has no Brotli decoder, so `Accept-Encoding` offers
`gzip, deflate` only. A response that arrives Brotli-encoded anyway means the server ignored the
request, which is a server fault rather than a policy breach — it is reported as
`FETCH_HTTP_ERROR`, not silently passed through as opaque bytes.
"""

from __future__ import annotations

import zlib

from ..adapter.failures import FailureCode
from .errors import FetchFailure

__all__ = [
    "ACCEPT_ENCODING",
    "BoundedDecoder",
    "RATIO_GUARD_MIN_COMPRESSED_BYTES",
    "SUPPORTED_ENCODINGS",
]

#: What the client offers. Never `br`: there is no standard-library Brotli decoder.
ACCEPT_ENCODING = "gzip, deflate"

SUPPORTED_ENCODINGS = ("identity", "gzip", "x-gzip", "deflate")

#: Below this much compressed input the ratio is meaningless (a header expands to almost nothing).
RATIO_GUARD_MIN_COMPRESSED_BYTES = 64 * 1024


class BoundedDecoder:
    """Streaming transport decoder with a hard output ceiling and a ratio guard."""

    __slots__ = (
        "encoding",
        "_max_bytes",
        "_max_ratio",
        "_decompressor",
        "_raw_retry_pending",
        "_ratio_warmup",
        "_output_step",
        "compressed_total",
        "decompressed_total",
    )

    def __init__(self, encoding: str | None, max_decompressed_bytes: int, max_ratio: int) -> None:
        self.encoding = (encoding or "identity").strip().lower() or "identity"
        if self.encoding not in SUPPORTED_ENCODINGS:
            raise FetchFailure(
                FailureCode("FETCH_HTTP_ERROR"),
                f"the server used an unrequested Content-Encoding {self.encoding!r}",
                details={"content_encoding": self.encoding},
            )
        self._max_bytes = int(max_decompressed_bytes)
        self._max_ratio = int(max_ratio)
        # The ratio only becomes meaningful once enough compressed input has been consumed that a
        # bomb could plausibly be under way, and it must become meaningful COMFORTABLY BEFORE the
        # absolute cap, or the cap always fires first and the ratio guard is decorative. Both
        # thresholds are therefore derived from the cap and clamped by the production constant, so
        # a test that shrinks `max_decompressed_bytes` still exercises the guard on a KiB-sized
        # fixture (R14) while production keeps the full 64 KiB warm-up.
        self._ratio_warmup = min(
            RATIO_GUARD_MIN_COMPRESSED_BYTES,
            max(256, self._max_bytes // max(self._max_ratio * 8, 1)),
        )
        self._output_step = max(64 * 1024, self._max_bytes // 16)
        self.compressed_total = 0
        self.decompressed_total = 0
        self._raw_retry_pending = self.encoding == "deflate"
        if self.encoding in ("gzip", "x-gzip"):
            self._decompressor = zlib.decompressobj(16 + zlib.MAX_WBITS)
        elif self.encoding == "deflate":
            self._decompressor = zlib.decompressobj()
        else:
            self._decompressor = None

    @property
    def is_identity(self) -> bool:
        return self._decompressor is None

    def _allowance(self) -> int:
        return self._max_bytes - self.decompressed_total

    def _abort(self, why: str, guard: str) -> FetchFailure:
        return FetchFailure(
            FailureCode("FETCH_DECOMPRESSION_LIMIT"),
            why,
            details={
                "guard": guard,
                "compressed_bytes": self.compressed_total,
                "decompressed_bytes": self.decompressed_total,
            },
        )

    def feed(self, chunk: bytes) -> bytes:
        """Decode *chunk*, producing at most the remaining allowance of output."""
        if not chunk:
            return b""
        self.compressed_total += len(chunk)
        if self._decompressor is None:
            self.decompressed_total += len(chunk)
            if self.decompressed_total > self._max_bytes:
                raise self._abort("the response exceeded the decompressed byte ceiling", "absolute")
            return chunk

        produced = bytearray()
        pending = chunk
        while True:
            allowance = self._allowance()
            if allowance <= 0:
                raise self._abort(
                    "the decompressed stream exceeded the decompressed byte ceiling", "absolute"
                )
            # One compressed chunk can expand to the whole allowance, so output is produced in
            # STEPS and the ratio is re-checked after each one. Without that, a bomb whose ratio is
            # extreme would hit the absolute cap first and the ratio guard would never fire.
            step = min(allowance + 1, self._output_step)
            try:
                out = self._decompressor.decompress(pending, max_length=step)
            except zlib.error as exc:
                if self._raw_retry_pending and self.decompressed_total == 0:
                    # Some servers send raw deflate for `Content-Encoding: deflate`.
                    self._decompressor = zlib.decompressobj(-zlib.MAX_WBITS)
                    self._raw_retry_pending = False
                    continue
                raise FetchFailure(
                    FailureCode("FETCH_HTTP_ERROR"),
                    f"the response body is not valid {self.encoding}: {exc}",
                ) from exc
            self._raw_retry_pending = False
            produced.extend(out)
            self.decompressed_total += len(out)
            if self.decompressed_total > self._max_bytes:
                raise self._abort(
                    "the decompressed stream exceeded the decompressed byte ceiling", "absolute"
                )
            self._check_ratio()
            pending = self._decompressor.unconsumed_tail
            if not pending:
                break

        return bytes(produced)

    def finish(self) -> bytes:
        """Flush whatever the decoder still holds, under the same ceiling."""
        if self._decompressor is None:
            return b""
        allowance = self._allowance()
        if allowance <= 0:
            return b""
        tail = self._decompressor.flush(allowance + 1)
        self.decompressed_total += len(tail)
        if self.decompressed_total > self._max_bytes:
            raise self._abort(
                "the decompressed stream exceeded the decompressed byte ceiling", "absolute"
            )
        self._check_ratio()
        return tail

    def _check_ratio(self) -> None:
        if self.compressed_total < self._ratio_warmup:
            return
        ratio = self.decompressed_total / max(self.compressed_total, 1)
        if ratio > self._max_ratio:
            raise self._abort(
                f"the compression ratio {ratio:.1f} exceeds the guard of {self._max_ratio}",
                "ratio",
            )
