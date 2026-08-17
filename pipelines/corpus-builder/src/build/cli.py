"""`python -m build build-candidate …` — the release build's command line (deliverable 10).

INVOCATION — a recorded deviation from the ticket's wording, on CRPS-05's precedent:

    PYTHONPATH=pipelines/corpus-builder/src uv run python -m build build-candidate \\
        --corpus <corpus.sqlite> --out <dir> --release-id <id> --embedding-dir <dir> \\
        --versions <versions.json> --compatibility <compatibility.json> \\
        --model-pins <pins.json> --runtime-pin <runtime.json> --public-key <key.json> \\
        [--parent <release_id> --parent-corpus <corpus.sqlite>] \\
        [--evaluation-report <path>] [--index-command <path>] \\
        [--sign --key <path> --key-id <id>]

The ticket writes `uv run python -m corpus_builder build-candidate …`, but there is no importable
`corpus_builder` module and creating `src/corpus_builder/` would leave this ticket's file-scope; see
`build/__init__.py`. Reported as a ticket-wording writeback.

EXIT CODES (deliverable 10): `0` built · `2` rejected by a gate · `1` internal error, which includes
a pre-existing final path and an unreadable input file. A SIGNING FAILURE after successful gates is
a gate rejection (exit 2) and leaves NOTHING at the final path — the rename is the last step and
simply never happens.

EVERY PIN IS A FILE THE OPERATOR NAMES. There is no environment variable, no default and no
discovery anywhere in this module: breakdown plan §8 Q11 makes the pins values the release process
supplies, and `--model-pins`/`--runtime-pin` are REQUIRED for a `CANDIDATE`. In particular the
signing key is `--key <path>`, never `CORPUS_SIGNING_KEYFILE`, and no key material appears in any
message, log line or exception (PRD §20.2).

THERE IS NO WAY TO TURN A GATE OFF. No `--skip`, `--force`, `--only` or `--no-verify` exists, by
design; `tests/validation/test_gates_cannot_be_disabled.py` asserts the absence by source scan.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Sequence

from manifest import RELEASE_KINDS, CompatibilityRanges, Versions

from .assemble import FinalPathExists, StagingNotEmpty, assemble_bundle
from .indexes import ExternalLexicalIndexBuilder, NullLexicalIndexBuilder
from .plan import BuildRequest, InvalidBuildRequest, load_model_pins, load_runtime_pin

__all__ = ["build_parser", "main"]

EXIT_BUILT = 0
EXIT_INTERNAL_ERROR = 1
EXIT_REJECTED = 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m build",
        description="Build a candidate CorpusRelease bundle and run the PRD §12.2 gates.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    candidate = subparsers.add_parser(
        "build-candidate", help="assemble, gate and (optionally) sign a candidate release"
    )
    candidate.add_argument("--corpus", type=Path, required=True, help="the normalised corpus.sqlite")
    candidate.add_argument("--out", type=Path, required=True, help="the output directory")
    candidate.add_argument("--release-id", required=True, help="the release identifier")
    candidate.add_argument(
        "--embedding-dir",
        type=Path,
        required=True,
        help="CRPS-05's output directory (vectors.usearch, embedding-manifest.json)",
    )
    candidate.add_argument(
        "--versions", type=Path, required=True, help="JSON object of the recorded component versions"
    )
    candidate.add_argument(
        "--compatibility", type=Path, required=True, help="JSON object of the compatibility ranges"
    )
    candidate.add_argument(
        "--embedding-profile-id", required=True, help="the embedding profile the release records"
    )
    candidate.add_argument(
        "--chunk-profile-id", required=True, help="the chunk profile the corpus was chunked with"
    )
    candidate.add_argument("--parent", default=None, help="the parent release id")
    candidate.add_argument(
        "--parent-corpus", type=Path, default=None, help="the parent release's corpus.sqlite"
    )
    candidate.add_argument("--evaluation-report", type=Path, default=None)
    candidate.add_argument(
        "--model-pins", type=Path, default=None, help="JSON array of ModelPin objects"
    )
    candidate.add_argument("--runtime-pin", type=Path, default=None, help="JSON RuntimePin object")
    candidate.add_argument(
        "--public-key",
        type=Path,
        action="append",
        default=[],
        dest="public_keys",
        help="a trusted public key file; repeatable",
    )
    candidate.add_argument("--release-kind", default="CANDIDATE", choices=list(RELEASE_KINDS))
    candidate.add_argument("--allow-not-run-evaluation", action="store_true")
    candidate.add_argument(
        "--index-command",
        type=Path,
        default=None,
        help="the ABSOLUTE path to the pinned offline lexical index binary (ADR 0003); a relative "
        "path or a bare name is refused, because PATH is never searched. Without it the "
        "declared-ABSENT null builder is used, which is a BLOCKING gate failure for a CANDIDATE",
    )
    candidate.add_argument("--sign", action="store_true")
    candidate.add_argument("--key", type=Path, default=None, help="the signing key file")
    candidate.add_argument("--key-id", default=None, help="the signing key identity")
    return parser


def _load_object(path: Path, what: str) -> dict[str, Any]:
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(document, dict):
        raise InvalidBuildRequest(f"{what} at {path} must contain a JSON object")
    return document


def _request_from(arguments: argparse.Namespace) -> BuildRequest:
    pins = () if arguments.model_pins is None else load_model_pins(arguments.model_pins)
    runtime = None if arguments.runtime_pin is None else load_runtime_pin(arguments.runtime_pin)
    if arguments.release_kind == "CANDIDATE" and (
        arguments.model_pins is None or arguments.runtime_pin is None
    ):
        # Required for a CANDIDATE, and required as FILES — never an environment lookup and never a
        # default (breakdown plan §8 Q11). Stated here as well as gated, so the operator is told
        # before a build runs rather than after it is refused.
        raise InvalidBuildRequest(
            "--model-pins and --runtime-pin are required for a CANDIDATE build; a candidate that "
            "cannot state its pins must fail, not guess"
        )
    if arguments.sign and (arguments.key is None or arguments.key_id is None):
        raise InvalidBuildRequest("--sign requires both --key and --key-id")

    return BuildRequest(
        corpus_db_path=arguments.corpus,
        embedding_dir=arguments.embedding_dir,
        output_dir=arguments.out,
        release_id=arguments.release_id,
        versions=Versions.from_dict(_load_object(arguments.versions, "the versions file")),
        compatibility=CompatibilityRanges.from_dict(
            _load_object(arguments.compatibility, "the compatibility file")
        ),
        local_model_pins=pins,
        runtime_pin=runtime,
        embedding_profile_id=arguments.embedding_profile_id,
        chunk_profile_id=arguments.chunk_profile_id,
        public_key_paths=tuple(arguments.public_keys),
        release_kind=arguments.release_kind,
        parent_release_id=arguments.parent,
        parent_corpus_db_path=arguments.parent_corpus,
        evaluation_report_path=arguments.evaluation_report,
        allow_not_run_evaluation=bool(arguments.allow_not_run_evaluation),
        signing_key_path=arguments.key if arguments.sign else None,
        signing_key_id=arguments.key_id if arguments.sign else None,
    )


def _index_builder(arguments: argparse.Namespace) -> Any:
    if arguments.index_command is not None:
        return ExternalLexicalIndexBuilder(arguments.index_command)
    return NullLexicalIndexBuilder(
        reason="no --index-command was supplied (ADR 0003 / Q-CRPS-2)"
    )


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(list(argv) if argv is not None else None)
    try:
        request = _request_from(arguments)
    except (InvalidBuildRequest, OSError, json.JSONDecodeError, ValueError) as error:
        print(f"error: {type(error).__name__}: {error}", file=sys.stderr)
        return EXIT_INTERNAL_ERROR

    try:
        outcome = assemble_bundle(request, index_builder=_index_builder(arguments))
    except (FinalPathExists, StagingNotEmpty) as error:
        print(f"error: {error}", file=sys.stderr)
        return EXIT_INTERNAL_ERROR

    print(
        json.dumps(
            {
                "decision": outcome.decision,
                "release_id": request.release_id,
                "bundle_dir": None if outcome.bundle_dir is None else str(outcome.bundle_dir),
                "gate_report": str(outcome.gate_report_path),
                "release_diff": str(outcome.release_diff_path),
            },
            sort_keys=True,
            indent=2,
        )
    )
    return EXIT_BUILT if outcome.built else EXIT_REJECTED


if __name__ == "__main__":  # pragma: no cover — exercised through `__main__.py`
    raise SystemExit(main())
