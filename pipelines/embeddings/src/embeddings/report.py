"""`EmbeddingBuildResult` and `embedding-build-report.json` (CRPS-05 deliverable 7).

These are MEASUREMENTS. They are the evidence for two deferred breakdown-plan questions — §8 Q3
(`RLSE-11`'s hot-dense coverage numbers, deferred until real-scale measurement) and §8 Q5
(`GOLD-16`'s corpus statistics) — and they satisfy PRD §40.8 item 12's discipline ("measured
storage, parse time, index size and peak memory") applied to the embedding stage.

They are NEVER written back into the PRD's planning hypotheses by this ticket, and the pipeline
never caps tier coverage on the strength of them: PRD §2 forbids silently deleting agreed legal
scope, and a reduction decision under the settled Q3 policy belongs to `RLSE-11`.

This file is OURS — it is not `schemas/corpus-manifest/**` and no schema constrains it. That is
precisely why `resumed_from`, `profile_fingerprint` and `peak_rss_source` live here: the manifest
schema is `additionalProperties: false` and describes the FINAL STATE of an index, not the run that
produced it.

`peak_rss_source` travels with `peak_rss_bytes` so a reviewer can tell a real RSS measurement from
`memory.py`'s tracemalloc fallback. A number whose provenance is unknown is not evidence.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

__all__ = ["REPORT_FILENAME", "EmbeddingBuildResult", "write_build_report"]

REPORT_FILENAME = "embedding-build-report.json"


@dataclass(frozen=True)
class EmbeddingBuildResult:
    """What `build_embeddings()` returns. Deliverable 7 names the first six members."""

    embedded_count: int
    skipped_count: int
    vector_bytes: int
    peak_rss_bytes: int
    elapsed_seconds: float
    chunks_per_second: float
    #: Extras that describe the RUN rather than the index, and so cannot live in the manifest.
    peak_rss_source: str = "unknown"
    resumed_from: int | None = None
    profile_fingerprint: str = ""
    chunk_count: int = 0
    vector_sha256: str = ""

    def to_json(self) -> dict[str, object]:
        return asdict(self)


def write_build_report(result: EmbeddingBuildResult, path: Path) -> None:
    """Write the report atomically, next to the manifest.

    Same temp-file-then-`os.replace` discipline as the manifest: a half-written report read by
    `RLSE-11` would be worse than an absent one, because it would look like data.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(result.to_json(), sort_keys=True, indent=2) + "\n").encode("utf-8")
    temporary = path.with_name(path.name + ".partial")
    temporary.write_bytes(payload)
    os.replace(temporary, path)
