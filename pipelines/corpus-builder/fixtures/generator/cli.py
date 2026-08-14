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

`--out` IS GUARDED, BECAUSE REGENERATION REPLACES A DIRECTORY. This is the one command every future
consumer is told to run, and it takes an arbitrary path. It therefore rewrites a target only when
that target is (a) absent, (b) an empty directory, or (c) a directory that is recognisably a
`SYNTHETIC_FIXTURE` bundle — a `release-manifest.json` that parses, says `SYNTHETIC_FIXTURE`, and
sits among nothing but known bundle members. Anything else is refused with an explanation and left
untouched; a mistyped `--out` must never be able to delete an unrelated tree. The staging directory
is unique per invocation (`tempfile.mkdtemp`), so two concurrent runs against the same target cannot
compute the same scratch path and delete each other's in-flight build, and it is removed in a
`finally` so a failed run leaves no untracked residue beside the committed bundle.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
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


#: The PRD §18.4 bundle layout. A directory holding only these may be replaced; anything else is
#: some other directory the user did not mean to hand to a generator.
BUNDLE_MEMBERS = frozenset(
    {
        "corpus.sqlite",
        "tantivy",
        "vectors.usearch",
        "embedding-manifest.json",
        "release-manifest.json",
    }
)


class UnsafeOutputDirectory(Exception):
    """`--out` names something this command must not delete."""


def assert_rewritable(out_dir: Path) -> None:
    """Refuse any `--out` target that is not absent, empty, or a `SYNTHETIC_FIXTURE` bundle.

    Regeneration replaces the target directory, so the only question that matters is whether this
    command is entitled to destroy what is already there. It is entitled to destroy a fixture bundle
    it could itself have produced, and nothing else. The check is deliberately about the CONTENT of
    the target rather than its path: confining `--out` under `fixtures/releases/**` would make the
    committed bundle safe while leaving every other mistyped path just as destructive, and it would
    make the command untestable outside the repository's own tree.
    """
    if out_dir.is_symlink():
        raise UnsafeOutputDirectory(
            f"--out is a symlink: {out_dir}. Refusing — replacing it would follow the link and "
            "destroy its target."
        )
    if not out_dir.exists():
        return
    if not out_dir.is_dir():
        raise UnsafeOutputDirectory(f"--out is not a directory: {out_dir}. Refusing to delete it.")

    entries = sorted(child.name for child in out_dir.iterdir())
    if not entries:
        return

    manifest = out_dir / "release-manifest.json"
    if not manifest.is_file():
        raise UnsafeOutputDirectory(
            f"--out is a non-empty directory that is not a fixture bundle: {out_dir} "
            f"(contains {entries}, and no release-manifest.json). Refusing to delete it. Point "
            "--out at an empty or absent directory, or at an existing SYNTHETIC_FIXTURE bundle."
        )
    unexpected = [name for name in entries if name not in BUNDLE_MEMBERS]
    if unexpected:
        raise UnsafeOutputDirectory(
            f"--out holds a release-manifest.json but also {unexpected}, which is not the PRD §18.4 "
            f"bundle layout: {out_dir}. Refusing to delete it — this may not be a fixture bundle."
        )
    try:
        document = json.loads(manifest.read_text(encoding="utf-8"))
        release_kind = document["release_kind"]
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise UnsafeOutputDirectory(
            f"--out holds a release-manifest.json that cannot be read as one ({error}): {out_dir}. "
            "Refusing to delete it."
        ) from error
    if release_kind != "SYNTHETIC_FIXTURE":
        raise UnsafeOutputDirectory(
            f"--out holds a {release_kind!r} release, not a SYNTHETIC_FIXTURE: {out_dir}. Refusing "
            "to overwrite it — this generator only ever produces synthetic fixtures, so a real "
            "release here is a mistyped path at best."
        )


def regenerate(out_dir: Path, *, seed: int, use_fresh_timestamp: bool) -> int:
    try:
        assert_rewritable(out_dir)
    except UnsafeOutputDirectory as error:
        print(f"refusing to regenerate: {error}", file=sys.stderr)
        return 2

    built_at = None if use_fresh_timestamp else _existing_build_timestamp(out_dir)

    # Stage inside the repository (Codex's sandbox has no %TEMP%, and a cross-volume os.replace
    # would fail anyway), then swap. An aborted run can then never leave a half-written committed
    # artifact behind. The staging path is UNIQUE per invocation: a fixed `.<name>.staging` sibling
    # let two concurrent runs against the same --out rmtree each other's in-flight build.
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_root = Path(tempfile.mkdtemp(prefix=f".{out_dir.name}.staging-", dir=out_dir.parent))
    staging = staging_root / out_dir.name
    try:
        try:
            build_fixture_release(staging, seed=seed, built_at=built_at)
        except FixtureBuildFailed as error:
            print(f"fixture build FAILED: {error}", file=sys.stderr)
            return 1
        # The new bundle is built and self-verified. Retire the old one to a unique sibling first,
        # so the window in which the target does not exist is a rename rather than a delete.
        retired = None
        if out_dir.exists():
            retired = staging_root / f"{out_dir.name}.retired"
            out_dir.replace(retired)
        try:
            staging.replace(out_dir)
        except OSError:
            if retired is not None:
                retired.replace(out_dir)
            raise
    finally:
        shutil.rmtree(staging_root, ignore_errors=True)

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
