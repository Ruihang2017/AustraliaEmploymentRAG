"""Regenerate the golden embedding manifest. Mirrors CRPS-02's `regenerate.py` helper.

    PYTHONPATH=pipelines/embeddings/src uv run python \\
        pipelines/embeddings/tests/fixtures/golden/regenerate.py

Writes `embedding-manifest.json` beside this file with `built_at` and the two platform-dependent
`vector_file` members normalised to fixed placeholders — see this directory's README for why those
three and no others.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


def _repo_root() -> Path:
    here = Path(__file__).resolve()
    for candidate in [here, *here.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError(f"cannot locate the repository root from {here}")


ROOT = _repo_root()
for _path in (
    ROOT / "pipelines" / "embeddings" / "src",
    ROOT / "pipelines" / "corpus-builder" / "src",
    ROOT / "pipelines" / "embeddings" / "tests",
):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from embed_golden_support import golden_document  # noqa: E402

GOLDEN = Path(__file__).resolve().parent / "embedding-manifest.json"


def main() -> int:
    with tempfile.TemporaryDirectory() as work:
        document = golden_document(Path(work))
    GOLDEN.write_bytes(
        (json.dumps(document, sort_keys=True, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    )
    print(f"wrote {GOLDEN}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
