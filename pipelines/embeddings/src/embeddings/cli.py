"""`python -m embeddings build ...` (CRPS-05 deliverable 8).

    PYTHONPATH=pipelines/embeddings/src uv run python -m embeddings build \\
        --corpus <path> --profile <path> --runtime-pin <path> --out <dir> \\
        --provider {local,stub} [--resume] [--tiers TIER_1_FULL_SEMANTIC,...]

The `PYTHONPATH=` prefix is a deviation from the ticket's literal command line: the root pytest /
uv configuration puts only the repository root on `sys.path`, and adding this member's `src` to the
root `pyproject.toml` is FND-01's file-scope. Recorded as a ticket-wording writeback.

`--provider` IS REQUIRED AND HAS NO DEFAULT. That is the single most important line in this module.
A stub selected implicitly — as a fallback when a model file is missing, or as a default nobody
noticed — would put unusable vectors into a signed release, and the ticket's Reviewer-focus names
exactly that failure. `--provider local` also requires the artefact paths; a missing artefact is
`ProviderUnavailable`, never a downgrade.

No credentials, no network, no model-hub id resolution anywhere in this file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Sequence

from .build import build_embeddings
from .errors import EmbeddingError, ProviderUnavailable
from .profile import PinnedProfile, load_runtime_pin
from .provider import DeterministicStubProvider, EmbeddingProvider, LocalModelProvider

__all__ = ["build_parser", "main"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m embeddings",
        description="Offline embedding build (CRPS-05). Never runs in production — PRD §19.1.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build = subparsers.add_parser("build", help="Embed the dense-eligible chunks of a corpus.")
    build.add_argument("--corpus", required=True, type=Path, help="Path to corpus.sqlite.")
    build.add_argument("--profile", required=True, type=Path, help="Pinned profile JSON.")
    build.add_argument(
        "--runtime-pin",
        required=True,
        type=Path,
        help="Runtime pin JSON (breakdown plan §8 Q11; supplied by RETR-07 via CRPS-06). "
        "Never inferred from the environment or a lockfile.",
    )
    build.add_argument("--out", required=True, type=Path, help="Output bundle directory.")
    build.add_argument(
        "--provider",
        required=True,
        choices=("local", "stub"),
        help="REQUIRED and defaultless. The stub is never a fallback for a missing local model.",
    )
    build.add_argument("--model-artefact", type=Path, help="Local model artefact path (--provider local).")
    build.add_argument("--tokenizer", type=Path, help="Local tokenizer.json path (--provider local).")
    build.add_argument("--resume", action="store_true", help="Skip chunks already embedded, unchanged.")
    build.add_argument(
        "--tiers",
        help="Comma-separated PRD §17.2 tiers to embed. Default: TIER_1_FULL_SEMANTIC only, "
        "because PRD §17.2 makes Tier 2 selective rather than automatic.",
    )
    build.add_argument("--source-release-id", help="The release whose chunks are being embedded.")
    return parser


def _make_provider(arguments: argparse.Namespace, pinned: PinnedProfile) -> EmbeddingProvider:
    """Construct exactly the provider that was asked for. No fallback path exists here."""
    if arguments.provider == "stub":
        return DeterministicStubProvider(
            seed=pinned.profile.seed,
            dimensions=pinned.profile.dimensions,
            normalisation=pinned.profile.normalisation,
        )
    if arguments.model_artefact is None or arguments.tokenizer is None:
        raise ProviderUnavailable(
            "--provider local requires --model-artefact and --tokenizer: the artefact is a local "
            "path, never a model-hub id (breakdown plan §8 Q11)"
        )
    return LocalModelProvider(
        arguments.model_artefact,
        arguments.tokenizer,
        pinned.model_artifact,
        pinned.tokenizer_artifact_sha256,
        pinned.profile,
    )


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    try:
        pinned = PinnedProfile.load(arguments.profile)
        runtime = load_runtime_pin(arguments.runtime_pin)
        provider = _make_provider(arguments, pinned)
        tiers = [name.strip() for name in arguments.tiers.split(",") if name.strip()] if arguments.tiers else None
        result = build_embeddings(
            arguments.corpus,
            pinned,
            provider,
            runtime,
            arguments.out,
            resume=arguments.resume,
            tiers=tiers,
            source_release_id=arguments.source_release_id,
        )
    except EmbeddingError as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError) as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1

    print(
        f"embedded {result.embedded_count} chunk(s), skipped {result.skipped_count}, "
        f"{result.vector_bytes} vector bytes, peak RSS {result.peak_rss_bytes} bytes "
        f"({result.peak_rss_source})"
    )
    return 0
