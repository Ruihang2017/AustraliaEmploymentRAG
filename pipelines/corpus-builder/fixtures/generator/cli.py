"""Regenerate the committed fixture bundle (CRPS-08 deliverable 8).

    uv run python pipelines/corpus-builder/fixtures/generator/cli.py regenerate [--out DIR]
                                                                               [--seed N] [--now]

THE TICKET NAMES THIS INVOCATION (deliverable 8, amended 2026-08-15; sub-PRD D16). It originally
named `uv run python -m corpus_builder.fixtures regenerate`, and the amendment landed in the ticket
before this file's argument surface was allowed to differ from it.
No importable `corpus_builder` package
exists or may be created: `pipelines/corpus-builder` is a uv member with `package = false`, its one
package directory is `taxrag_pipeline_corpus_builder/`, and `tools/workspace-assertions.mjs::
assertSkeleton()` asserts each member holds EXACTLY ONE immediate child directory containing
`__init__.py` — so adding `fixtures/__init__.py` fails `pnpm test` repository-wide, and adding a
module under the existing package directory is outside this ticket's file-scope. The script-path
form above is the precedent this repository already uses for generator scripts
(`tests/manifest/fixtures/golden/regenerate.py`). See `fixtures/README.md`.

WITHOUT `--now` THE BUILD TIMESTAMP IS REUSED from the manifest already at the target, which is what
makes "running it on a clean tree leaves `git status` clean" literally true: the signed manifest
covers the build timestamps, so a fresh clock changes `manifest_sha256` and the signature too.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

# Run as a SCRIPT PATH, so the package root goes on sys.path here rather than being inherited.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from generator._paths import COMMITTED_BUNDLE_DIR, SEED_DEFAULT  # noqa: E402
from generator.build_fixture import FixtureBuildFailed, build_fixture_release  # noqa: E402


def _existing_build_timestamp(bundle: Path) -> str | None:
    manifest = bundle / "release-manifest.json"
    if not manifest.is_file():
        return None
    try:
        document = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    value = document.get("build_started_at")
    return value if isinstance(value, str) else None


def regenerate(out_dir: Path, *, seed: int, use_fresh_timestamp: bool) -> int:
    built_at = None if use_fresh_timestamp else _existing_build_timestamp(out_dir)

    # Stage inside the repository (Codex's sandbox has no %TEMP%, and a cross-volume os.replace
    # would fail anyway), then swap. An aborted run can then never leave a half-written committed
    # artifact behind.
    staging = out_dir.parent / f".{out_dir.name}.staging"
    if staging.exists():
        shutil.rmtree(staging)
    try:
        build_fixture_release(staging, seed=seed, built_at=built_at)
    except FixtureBuildFailed as error:
        print(f"fixture build FAILED: {error}", file=sys.stderr)
        return 1
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    staging.replace(out_dir)

    document = json.loads((out_dir / "release-manifest.json").read_text(encoding="utf-8"))
    files = sorted(
        (path.relative_to(out_dir).as_posix(), path.stat().st_size)
        for path in out_dir.rglob("*")
        if path.is_file()
    )
    print(f"release_id      {document['release_id']}")
    print(f"release_kind    {document['release_kind']}")
    print(f"manifest_sha256 {document['manifest_sha256']}")
    print(f"signed by       {document['signature']['key_id']}")
    print(f"build_started_at {document['build_started_at']}")
    for name, size in files:
        print(f"  {size:>10}  {name}")
    print(f"  {sum(size for _, size in files):>10}  TOTAL ({len(files)} files)")
    print(f"verified bundle at {out_dir}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="CRPS-08 synthetic fixture release generator")
    subcommands = parser.add_subparsers(dest="command", required=True)
    rebuild = subcommands.add_parser("regenerate", help="rebuild the committed fixture bundle")
    rebuild.add_argument("--out", type=Path, default=COMMITTED_BUNDLE_DIR,
                         help="bundle directory to rebuild (default: the committed one)")
    rebuild.add_argument("--seed", type=int, default=SEED_DEFAULT, help="generation seed")
    rebuild.add_argument("--now", action="store_true",
                         help="stamp a fresh build time instead of reusing the recorded one")
    arguments = parser.parse_args(argv)
    return regenerate(arguments.out, seed=arguments.seed, use_fresh_timestamp=arguments.now)


if __name__ == "__main__":
    raise SystemExit(main())
