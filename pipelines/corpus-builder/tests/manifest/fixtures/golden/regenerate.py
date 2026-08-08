"""Re-hash and re-sign the golden manifest after a deliberate hand edit.

    uv run python pipelines/corpus-builder/tests/manifest/fixtures/golden/regenerate.py

It rewrites `manifest_sha256` and `signature` in place and changes nothing else. It is a maintenance
helper, not part of the contract: a re-implementer reads the JSON and
`schemas/corpus-manifest/README.md`, never this script.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _repo_root() -> Path:
    for candidate in [HERE, *HERE.parents]:
        if (candidate / "pyproject.toml").is_file() and (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    raise RuntimeError("cannot locate the repository root")


sys.path.insert(0, str(_repo_root() / "pipelines" / "corpus-builder" / "src"))

from manifest import ReleaseManifest, sign_manifest, write_manifest  # noqa: E402
from manifest.canonical import manifest_sha256  # noqa: E402

KEY_DIR = HERE.parent / "keys"
KEY_ID = "dev-corpus-signing-001"


def main() -> None:
    path = HERE / "release-manifest.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["signature"] = None
    document["manifest_sha256"] = manifest_sha256(document)
    manifest = sign_manifest(
        ReleaseManifest.from_dict(document),
        private_key_path=KEY_DIR / f"{KEY_ID}.private.json",
        key_id=KEY_ID,
    )
    write_manifest(manifest, path)
    print(f"regenerated {path.name}: manifest_sha256={manifest.manifest_sha256}")


if __name__ == "__main__":
    main()
