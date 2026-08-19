"""Deliverable 14 — the dataset command line.

INVOCATION. The ticket names `python -m evaluation.dataset`. That module path is not satisfiable in
this repository as it stands: modules under `pipelines/<member>/src/` are TOP-LEVEL modules rooted
at that directory (the convention `CRPS-01` fixed and every member follows), `pipelines/evaluation`
is not an importable package, and making `evaluation.dataset` resolve would need either a new
`src/evaluation/` package directory — outside this ticket's declared file-scope, and a module-wide
convention change binding `GOLD-02` … `GOLD-16` — or a change to the PRD §44.3 serial-owned root
manifest. Rather than silently redefine the ticket's command or edit another module's file, two
forms are shipped and the ticket amendment is raised as a docs PR (build report OQ-1):

    python -m dataset verify --complete                    # with pipelines/evaluation/src on sys.path
    uv run python pipelines/evaluation/src/dataset/cli.py verify --complete   # from the repo root

The second works with no configuration because this file bootstraps its own package root when run
as a script path — the precedent is `pipelines/corpus-builder/fixtures/generator/cli.py`.

EXIT CODE. Non-zero on any `FAIL` **or** `UNRESOLVED` finding. `UNRESOLVED` is never a pass
(sub-PRD D11), so `verify` exits non-zero on a correct dataset while `packages/contracts` publishes
no `Jurisdiction` family and while no `--release` is pinned. That is intended; assert finding IDs
rather than the exit code, and never "fix" it by defaulting a check to pass.

OUTPUT. No case content, ever, in any format or on any stream. A finding names a check id, a
category, a case id, a field name and a count — plan §8 Q6 item 15.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

if __package__ in (None, ""):  # pragma: no cover — exercised by the script-path invocation test
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    __package__ = "dataset"

from . import blind, yaml_min  # noqa: E402
from .checks import CHECKS, CheckContext, run_checks  # noqa: E402
from .compose import SIDECAR_SUFFIX, compose  # noqa: E402
from .findings import Finding  # noqa: E402
from .model import content_sha256  # noqa: E402
from .paths import EVALS_DIR, SCHEMAS_DIR  # noqa: E402

__all__ = ["build_parser", "main"]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dataset",
        description="Evaluation dataset composer, integrity checker and blind guard (GOLD-01).",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=None,
        help="an evals-shaped directory (default: the repository's evals/)",
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    sub = parser.add_subparsers(dest="command", required=True)

    verify = sub.add_parser("verify", help="run the integrity checks")
    scope = verify.add_mutually_exclusive_group()
    scope.add_argument("--category", help="restrict to one category directory slug")
    scope.add_argument(
        "--complete",
        action="store_true",
        help="also run COMPLETE_DATASET, the whole-dataset invariant GOLD-17 requires",
    )
    verify.add_argument("--release", type=Path, help="a CorpusRelease bundle directory to resolve gold against")
    verify.add_argument(
        "--release-public-key-file",
        type=Path,
        action="append",
        default=[],
        dest="release_public_key_files",
        help="a trusted signer public-key file for --release (repeatable)",
    )

    seal = sub.add_parser("seal", help="seal an untracked authoring directory into envelopes + sidecars")
    seal.add_argument("--category", required=True)
    seal.add_argument("--in", dest="input_dir", type=Path, required=True)
    seal.add_argument("--sealer", default="evaluation-author-agent")
    seal.add_argument("--recipient", type=Path, default=None, help="path to blind-recipient.pub")

    sub.add_parser("guard-blind", help="the key-less repository guard (checks 10 and 11)")

    hash_command = sub.add_parser("hash", help="print each case's canonical content digest")
    hash_command.add_argument("--category")

    version = sub.add_parser("version", help="dataset-version registry operations")
    version_sub = version.add_subparsers(dest="version_command", required=True)
    version_new = version_sub.add_parser("new", help="register the current content as a new version")
    version_new.add_argument("--reason", required=True)
    version_new.add_argument("--approved-by", required=True, dest="approved_by")
    version_new.add_argument("--version", dest="version_id", help="explicit version id (default: next)")

    migrate = sub.add_parser("migrate", help="create a migration record linking old and new gold")
    migrate.add_argument("--from", dest="from_version", required=True)
    migrate.add_argument("--to", dest="to_version", required=True)
    migrate.add_argument("--reason", required=True)
    migrate.add_argument("--approved-by", required=True, dest="approved_by")
    migrate.add_argument("--classification", required=True)
    migrate.add_argument("--case", action="append", default=[], dest="cases")
    return parser


def main(argv: Sequence[str] | None = None, *, stdout=None, stderr=None) -> int:
    parser = build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)
    out = stdout if stdout is not None else sys.stdout
    err = stderr if stderr is not None else sys.stderr
    root = args.root if args.root is not None else EVALS_DIR

    if args.command == "verify":
        return _verify(args, root, out)
    if args.command == "guard-blind":
        return _report(blind.guard(root), args.format, out)
    if args.command == "hash":
        return _hash(args, root, out)
    if args.command == "seal":
        return _seal(args, root, out, err)
    if args.command == "version":
        return _version_new(args, root, out, err)
    if args.command == "migrate":
        return _migrate(args, root, out, err)
    parser.error(f"unknown command {args.command!r}")  # pragma: no cover — argparse forbids it
    return 2


# -- verify ------------------------------------------------------------------------------------


def _verify(args, root: Path, out) -> int:
    dataset = compose(root)
    context = CheckContext(
        schemas_dir=SCHEMAS_DIR,
        release=args.release,
        release_public_keys=tuple(args.release_public_key_files),
        complete=bool(args.complete),
        category=args.category,
    )
    return _report(run_checks(dataset, context), args.format, out)


def _report(findings: list[Finding], fmt: str, out) -> int:
    blocking = [finding for finding in findings if finding.blocks()]
    if fmt == "json":
        print(
            json.dumps(
                {
                    "findings": [finding.as_dict() for finding in findings],
                    "counts": {
                        "FAIL": sum(1 for f in findings if f.severity == "FAIL"),
                        "UNRESOLVED": sum(1 for f in findings if f.severity == "UNRESOLVED"),
                    },
                    "ok": not blocking,
                },
                indent=2,
            ),
            file=out,
        )
    else:
        for finding in findings:
            print(finding.render(), file=out)
        print(
            f"{len(findings)} finding(s): "
            f"{sum(1 for f in findings if f.severity == 'FAIL')} FAIL, "
            f"{sum(1 for f in findings if f.severity == 'UNRESOLVED')} UNRESOLVED",
            file=out,
        )
    return 1 if blocking else 0


# -- hash --------------------------------------------------------------------------------------


def _hash(args, root: Path, out) -> int:
    dataset = compose(root)
    rows = []
    for entry in dataset.categories:
        if args.category is not None and entry.slug != args.category:
            continue
        for case in entry.cases:
            rows.append(
                {
                    "id": case.id,
                    "split": case.split,
                    "primary_category": entry.slug,
                    "content_sha256": case.content_sha256(),
                    "expected_output_sha256": case.expected_output_sha256(),
                }
            )
        for sidecar in entry.sidecars:
            row = {
                "id": sidecar.id,
                "split": "BLIND",
                "primary_category": entry.slug,
                "content_sha256": sidecar.content_sha256(),
            }
            if sidecar.envelope is not None:
                row["envelope_sha256"] = sidecar.envelope.ciphertext_sha256
                # Copied from the envelope, never recomputed: only `seal` holds the plaintext this
                # digest is taken over. An envelope sealed without a salt has none, and the row is
                # written without one so VERSIONED_CORRECTIONS reports it UNRESOLVED rather than
                # inventing an identity for content it cannot see.
                if sidecar.envelope.blind_content_sha256:
                    row["blind_content_sha256"] = sidecar.envelope.blind_content_sha256
            rows.append(row)
    if args.format == "json":
        print(json.dumps({"cases": rows}, indent=2), file=out)
    else:
        for row in rows:
            print(f"{row['id']} {row['split']} {row['content_sha256']}", file=out)
    return 0


# -- seal --------------------------------------------------------------------------------------


def _seal(args, root: Path, out, err) -> int:
    """Read an untracked authoring directory, write envelopes + sidecars. Never echoes content.

    Requires only the recipient PUBLIC key (breakdown plan §8 Q6 item 11), so an authorised
    `evaluation-author` agent runs this without ever holding the private half.
    """
    recipient_path = args.recipient if args.recipient is not None else root / "splits" / blind.RECIPIENT_FILENAME
    try:
        key_id, public, major = blind.load_recipient(recipient_path)
    except blind.BlindRecipientKeyUnavailable:
        # Not an error in the recipient file — the recipient file is still the development
        # placeholder whose private half is publicly derivable. Refusing is the point; there is
        # no flag that overrides it.
        print(
            "refusing to seal: the recipient public key is still the development placeholder. "
            "Only the Founder replaces it (GOLD-01 [human] acceptance item; sub-PRD D22).",
            file=err,
        )
        return 2
    except (OSError, ValueError) as error:
        print(f"cannot read the recipient public key: {type(error).__name__}", file=err)
        return 2

    # The salt keys the only change detector a BLIND case can have (blind.blind_content_digest).
    # Refusing here rather than sealing without one is deliberate: an envelope with no content
    # digest can never be shown to have been corrected, and a sealing path that quietly produced
    # them would make PRD §14.3 unenforceable for exactly the split it matters most for.
    latest = compose(root).latest_version()
    salt = latest.content_hash_salt() if latest is not None else None
    if salt is None:
        print(
            "refusing to seal: the latest dataset-version registry records no content_hash_salt, "
            "so a sealed case would carry no content identity and VERSIONED_CORRECTIONS could "
            "never detect a correction to it (sub-PRD D8; PRD §14.3).",
            file=err,
        )
        return 2

    target = root / "cases" / args.category / "blind"
    sealed_count = 0
    for path in sorted(Path(args.input_dir).glob("*.yaml")):
        document = yaml_min.load_path(path)
        if not isinstance(document, dict) or "id" not in document:
            print(f"skipped a file with no id: {path.name}", file=err)
            continue
        case_id = str(document["id"])
        envelope, _ciphertext = blind.seal(
            yaml_min.dump(document).encode("utf-8"),
            public,
            case_id=case_id,
            recipient_key_id=key_id,
            blind_dataset_major_version=major,
            sealer=args.sealer,
            content_salt=salt,
        )
        blind.write_sealed(target, case_id, envelope)
        _write_sidecar(target, case_id, document, envelope["ciphertext_sha256"])
        sealed_count += 1
    print(f"sealed {sealed_count} case(s) into {target}", file=out)
    return 0


_SIDECAR_FIELDS = (
    "id",
    "split",
    "primary_category",
    "tags",
    "trap_types",
    "jurisdictions",
    "product_surface",
    "latency_class",
    "cost_class",
    "author",
    "reviewer",
    "change_reason",
)


def _write_sidecar(directory: Path, case_id: str, document: dict, digest: str) -> Path:
    """Project the case onto the allowlist. A field not named here never leaves the plaintext."""
    sidecar = {name: document.get(name) for name in _SIDECAR_FIELDS if name in document}
    sidecar["split"] = "BLIND"
    sidecar["envelope_digest"] = digest
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{case_id}{SIDECAR_SUFFIX}"
    temporary = directory / f".{case_id}{SIDECAR_SUFFIX}.partial"
    temporary.write_text(yaml_min.dump(sidecar), encoding="utf-8")
    import os

    os.replace(temporary, target)
    return target


# -- version / migrate ----------------------------------------------------------------------------


def _version_new(args, root: Path, out, err) -> int:
    dataset = compose(root)
    latest = dataset.latest_version()
    if args.version_id is not None:
        version_id = args.version_id
    else:
        version_id = f"v{(int(latest.version.lstrip('v')) + 1) if latest else 1}"
    if any(version.version == version_id for version in dataset.versions):
        print(f"{version_id} already exists; a version is never rewritten", file=err)
        return 2

    rows = []
    for entry in dataset.categories:
        for case in entry.cases:
            rows.append(
                {
                    "id": case.id,
                    "split": case.split,
                    "primary_category": entry.slug,
                    "content_sha256": case.content_sha256(),
                    "expected_output_sha256": case.expected_output_sha256(),
                }
            )
        for sidecar in entry.sidecars:
            row = {
                "id": sidecar.id,
                "split": "BLIND",
                "primary_category": entry.slug,
                "content_sha256": sidecar.content_sha256(),
            }
            if sidecar.envelope is not None:
                row["envelope_sha256"] = sidecar.envelope.ciphertext_sha256
                # Copied from the envelope, never recomputed: only `seal` holds the plaintext this
                # digest is taken over. An envelope sealed without a salt has none, and the row is
                # written without one so VERSIONED_CORRECTIONS reports it UNRESOLVED rather than
                # inventing an identity for content it cannot see.
                if sidecar.envelope.blind_content_sha256:
                    row["blind_content_sha256"] = sidecar.envelope.blind_content_sha256
            rows.append(row)

    document = {
        "version": version_id,
        "created_at": _now(),
        "approved_by": args.approved_by,
        "reason": args.reason,
        "cases": sorted(rows, key=lambda row: row["id"]),
    }
    # Carried forward unchanged, never regenerated: a new salt would make every BLIND case's
    # content digest incomparable with the previous version's, i.e. it would erase the very
    # correction history this registry exists to keep. Rotation is a Founder decision made by
    # editing the salt deliberately and saying so in the version's reason.
    salt = latest.content_hash_salt() if latest is not None else None
    if salt is not None:
        document["content_hash_salt"] = salt
    if latest is not None:
        document["supersedes"] = latest.version
    target = root / "splits" / "dataset-versions" / f"{version_id}.json"
    _write_json(target, document)
    print(f"wrote {target} with {len(rows)} case row(s)", file=out)
    return 0


def _migrate(args, root: Path, out, err) -> int:
    dataset = compose(root)
    by_id = {}
    for entry in dataset.categories:
        for case in entry.cases:
            by_id[case.id] = case
    mappings = []
    for case_id in args.cases:
        case = by_id.get(case_id)
        if case is None:
            print(f"unknown case id {case_id}", file=err)
            return 2
        previous = _gold_in(dataset, args.from_version, case_id)
        mappings.append(
            {
                "case_id": case_id,
                "old_gold": previous,
                "new_gold": list(case.raw.get("gold_authorities") or []),
            }
        )
    document = {
        "from_version": args.from_version,
        "to_version": args.to_version,
        "created_at": _now(),
        "reason": args.reason,
        "approved_by": args.approved_by,
        "classification": args.classification,
        "mappings": mappings,
    }
    target = root / "splits" / "migrations" / f"{args.from_version}-to-{args.to_version}.json"
    _write_json(target, document)
    print(f"wrote {target} with {len(mappings)} mapping(s)", file=out)
    return 0


def _gold_in(dataset, version_id: str, case_id: str) -> list:
    """A registry stores digests, not gold, so a prior migration is the only source of old gold."""
    for migration in dataset.migrations:
        if migration.to_version != version_id:
            continue
        for row in migration.raw.get("mappings") or []:
            if row.get("case_id") == case_id:
                return list(row.get("new_gold") or [])
    return []


def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _write_json(target: Path, document: dict) -> None:
    """Atomic: a partial JSON must never be observable to a concurrently running check (plan R4)."""
    import os

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.partial")
    temporary.write_text(
        json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    os.replace(temporary, target)


assert CHECKS  # a registry that failed to load would make `verify` silently vacuous
assert content_sha256 is not None

if __name__ == "__main__":  # pragma: no cover — exercised through a subprocess in the tests
    raise SystemExit(main())
